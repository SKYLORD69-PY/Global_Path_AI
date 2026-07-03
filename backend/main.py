"""
backend/app/main.py
====================
GlobalPath AI — FastAPI application entry point.

Startup sequence:
  1. Log presence (not values) of every required env var
    2. Create / migrate database tables via SQLAlchemy
  3. Initialise ChromaDB PersistentClient + ensure collection exists
  4. Warm up sentence-transformers embedding model
  5. Smoke-test Upstash Redis connection
  6. Register all API routers

Middleware stack (innermost first):
  RequestLoggingMiddleware → CORS → route handlers

Error handling:
  HTTPException          → { "error": detail, "code": status_code }
  RequestValidationError → { "error": "Validation failed", "code": 422,
                              "details": [field errors] }
  Unhandled Exception    → { "error": "Internal server error", "code": 500 }

Free-tier stack:
  LLM:        Groq API  (llama-3.3-70b-versatile)
    Database:   SQLite locally, PostgreSQL in deployment
    Vector DB:  ChromaDB  (local PersistentClient)
  Embeddings: sentence-transformers (all-MiniLM-L6-v2)
  Live Search: duckduckgo-search
  Auth:       Supabase Auth
  Cache:      Upstash Redis (HTTP REST)
  Host:       Render.com
"""

from __future__ import annotations

import os
import time
import traceback
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import ALL_ROUTERS
from app.core.config import settings

log = structlog.get_logger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Startup / shutdown helpers
# ─────────────────────────────────────────────────────────────────────────────

def _log_env_presence() -> None:
    """
    Log which env vars are present without revealing their values.
    Helps diagnose misconfigured deployments at a glance.
    """
    required = [
        "GROQ_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "SUPABASE_JWT_SECRET",
        "DATABASE_URL",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
    ]
    optional = [
        "CHROMA_PERSIST_DIR",
        "EMBEDDING_MODEL",
        "ADMIN_SECRET",
        "CORS_ORIGINS",
        "APP_ENV",
    ]
    log.info("env_var_check_start")
    for var in required:
        present = bool(os.getenv(var, "").strip())
        log.info("env_var", name=var, present=present, required=True)
        if not present:
            log.warning("env_var_missing", name=var,
                        hint=f"Set {var} in your .env or Render dashboard")

    for var in optional:
        present = bool(os.getenv(var, "").strip())
        log.info("env_var", name=var, present=present, required=False)


async def _init_database() -> None:
    """Create all SQLAlchemy-managed tables if they don't exist yet."""
    try:
        from app.models.database import engine, Base
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info("database_tables_ok")
    except Exception as exc:
        log.error("database_init_failed", error=str(exc))
        # Don't crash — the app can still serve cached/AI-only responses
        # even if the DB is temporarily unavailable.


async def _init_chromadb() -> None:
    """
    Open (or create) the ChromaDB PersistentClient and ensure the
    'globalpath-knowledge' collection exists.
    """
    try:
        import chromadb
        persist_dir = getattr(settings, "CHROMA_PERSIST_DIR", "./chroma_data")
        client      = chromadb.PersistentClient(path=persist_dir)
        collection  = client.get_or_create_collection(
            name="globalpath-knowledge",
            metadata={"hnsw:space": "cosine"},
        )
        count = collection.count()
        log.info("chromadb_ok", persist_dir=persist_dir, document_count=count)
    except Exception as exc:
        log.error("chromadb_init_failed", error=str(exc))


async def _warm_embedder() -> None:
    """
    Import and instantiate the sentence-transformers Embedder so the first
    real request doesn't pay the 2–3 s model-load penalty.
    """
    try:
        from app.rag.embedder import Embedder
        embedder = Embedder()
        # Encode a dummy sentence to trigger model download / cache load
        embedder.embed_query("GlobalPath AI warmup ping")
        model = getattr(settings, "EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        log.info("embedder_warm", model=model)
    except Exception as exc:
        log.warning("embedder_warmup_failed", error=str(exc))


async def _smoke_test_redis() -> None:
    """
    Send a PING to Upstash Redis to verify connectivity.
    Non-fatal: if Redis is unreachable the app falls back to no-cache mode.
    """
    try:
        from app.cache.redis_client import UpstashCache
        cache = UpstashCache()
        key   = UpstashCache.build_key("health", "startup")
        await cache.set(key, "ok", ttl=60)
        val = await cache.get(key)
        if val == "ok":
            log.info("redis_ok")
        else:
            log.warning("redis_smoke_unexpected", returned=val)
    except Exception as exc:
        log.warning("redis_smoke_failed", error=str(exc))


async def _close_database() -> None:
    """Gracefully dispose of the SQLAlchemy async engine connection pool."""
    try:
        from app.models.database import engine
        await engine.dispose()
        log.info("database_connections_closed")
    except Exception as exc:
        log.warning("database_close_failed", error=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan context manager
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs startup tasks before yielding control to the request loop,
    then runs shutdown tasks when the process exits.
    """
    # ── Startup ───────────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    log.info("globalpath_startup_begin",
             app_env=os.getenv("APP_ENV", "production"),
             version="1.0.0")

    _log_env_presence()

    # Run DB + ChromaDB + embedder + Redis init concurrently
    import asyncio
    await asyncio.gather(
        _init_database(),
        _init_chromadb(),
        _smoke_test_redis(),
        # Embedder warmup is CPU-bound — run in a thread to avoid blocking
        asyncio.get_event_loop().run_in_executor(None, lambda: asyncio.run(_warm_embedder()))
            if False  # disabled: run_in_executor + asyncio.run nests badly; call sync
            else _warm_embedder(),
        return_exceptions=True,
    )

    elapsed = (time.perf_counter() - t0) * 1000
    log.info("globalpath_startup_complete", startup_ms=round(elapsed, 1))

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    log.info("globalpath_shutdown_begin")
    await _close_database()
    log.info("globalpath_shutdown_complete")


# ─────────────────────────────────────────────────────────────────────────────
# Application factory
# ─────────────────────────────────────────────────────────────────────────────

def _parse_cors_origins() -> list[str]:
    """
    Read CORS_ORIGINS from env.  Accepts either:
      - A JSON array: '["https://globalpath-ai.vercel.app"]'
      - A comma-separated string: 'https://foo.com,https://bar.com'
    Always includes localhost variants for development.
    """
    import json
    raw = os.getenv("CORS_ORIGINS", "")
    origins: list[str] = []
    if raw.strip().startswith("["):
        try:
            origins = json.loads(raw)
        except json.JSONDecodeError:
            pass
    elif raw.strip():
        origins = [o.strip() for o in raw.split(",") if o.strip()]

    # Always allow local dev origins
    dev_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    return list(dict.fromkeys([*origins, *dev_origins]))


app = FastAPI(
    title="GlobalPath AI API",
    description=(
        "AI-powered study-abroad advisory platform. "
        "LLM: Groq (Llama 3.3-70B) · Vectors: ChromaDB · "
        "Auth: Supabase · Cache: Upstash Redis"
    ),
    version="1.0.0",
    docs_url="/docs"   if os.getenv("APP_ENV") != "production" else None,
    redoc_url="/redoc" if os.getenv("APP_ENV") != "production" else None,
    lifespan=lifespan,
)


# ─────────────────────────────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────────────────────────────

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = _parse_cors_origins(),
    allow_credentials = True,
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers     = ["*"],
    expose_headers    = ["X-Request-ID", "X-Response-Time"],
)


# ── Request logging ───────────────────────────────────────────────────────────
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """
    Logs every request: method + path + status code + duration.

    Example log line:
      {"event": "http_request", "method": "POST", "path": "/api/chat/message",
       "status": 200, "duration_ms": 342.1, "ip": "1.2.3.4"}
    """
    t_start     = time.perf_counter()
    request_id  = request.headers.get("X-Request-ID", "")
    client_ip   = request.client.host if request.client else "unknown"

    # Skip noisy health-check logs in production
    is_health = request.url.path in ("/health", "/")

    try:
        response = await call_next(request)
    except Exception as exc:
        duration = (time.perf_counter() - t_start) * 1000
        log.error(
            "http_request_unhandled",
            method=request.method,
            path=request.url.path,
            duration_ms=round(duration, 1),
            error=str(exc),
        )
        raise

    duration = (time.perf_counter() - t_start) * 1000
    response.headers["X-Response-Time"] = f"{duration:.0f}ms"
    if request_id:
        response.headers["X-Request-ID"] = request_id

    if not is_health or response.status_code >= 400:
        log.info(
            "http_request",
            method    = request.method,
            path      = request.url.path,
            status    = response.status_code,
            duration_ms = round(duration, 1),
            ip        = client_ip,
            request_id= request_id or None,
        )

    return response


# ─────────────────────────────────────────────────────────────────────────────
# Global error handlers
# ─────────────────────────────────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    Converts all FastAPI / Starlette HTTPExceptions to a consistent JSON shape:
      { "error": "<detail>", "code": <status_code> }
    """
    log.warning(
        "http_exception",
        path=request.url.path,
        status=exc.status_code,
        detail=exc.detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "code": exc.status_code},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Converts pydantic v2 RequestValidationError to a structured 422 response.
    Each invalid field is listed with its location and message.
    """
    field_errors = []
    for error in exc.errors():
        loc = " → ".join(str(p) for p in error.get("loc", []) if p != "body")
        field_errors.append({
            "field":   loc or "body",
            "message": error.get("msg", "Invalid value"),
            "type":    error.get("type", ""),
        })

    log.warning(
        "validation_error",
        path=request.url.path,
        error_count=len(field_errors),
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error":   "Validation failed",
            "code":    422,
            "details": field_errors,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """
    Last-resort handler for any unhandled exception.
    Logs the full traceback but returns a safe generic message to the client.
    """
    log.error(
        "unhandled_exception",
        path       = request.url.path,
        method     = request.method,
        error_type = type(exc).__name__,
        error      = str(exc),
        traceback  = traceback.format_exc(),
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error. The team has been notified.",
            "code":  500,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Built-in endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"], summary="Health check")
async def health_check():
    """
    Returns 200 when the app is running.
    Used by Render.com health monitoring and the CI deploy pipeline.
    """
    return {
        "status":  "ok",
        "service": "globalpath-ai-api",
        "version": "1.0.0",
        "env":     os.getenv("APP_ENV", "production"),
    }


@app.get("/", tags=["system"], summary="Root")
async def root():
    """Root redirect hint for browsers hitting the API directly."""
    return {
        "name":    "GlobalPath AI API",
        "version": "1.0.0",
        "docs":    "/docs" if os.getenv("APP_ENV") != "production" else "disabled in production",
        "health":  "/health",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Router registration
# ─────────────────────────────────────────────────────────────────────────────

for _prefix, _router, _tags in ALL_ROUTERS:
    app.include_router(_router, prefix=_prefix, tags=_tags)

log.info(
    "routers_registered",
    routes=[p for p, _, _ in ALL_ROUTERS],
    total=len(ALL_ROUTERS),
)
