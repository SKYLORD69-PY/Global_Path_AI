"""
GlobalPath AI — FastAPI Application Entry Point
=================================================
This is the root of the Python backend. It:
  - Creates the FastAPI app instance with metadata
  - Registers all routers under their URL prefixes
  - Configures CORS for local dev (localhost:5173) and production (Vercel)
  - Runs a lifespan context that opens DB + ChromaDB connections on startup
    and closes them gracefully on shutdown
  - Exposes a /health endpoint for Render.com uptime checks and Docker healthchecks

To run locally:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

To run in Docker (see docker-compose.yml):
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

log = structlog.get_logger(__name__)

# ─── Lazy imports for heavy modules ──────────────────────────────────────────
# These are imported inside the lifespan function so startup errors are
# caught and logged before the app begins serving requests.

_startup_errors: list[str] = []


# ═════════════════════════════════════════════════════════════════════════════
#  Lifespan: startup + shutdown
# ═════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    FastAPI lifespan context manager.

    Startup tasks (in order):
      1. Verify all required environment variables are set
      2. Create PostgreSQL tables (idempotent — skips if they exist)
      3. Warm up the sentence-transformers embedding model
      4. Verify ChromaDB collection is accessible
      5. Log startup summary

    Shutdown tasks:
      1. Dispose the SQLAlchemy async engine (drains connection pool)
      2. Log clean shutdown
    """
    t_start = time.perf_counter()
    log.info("app_startup_begin", env=os.getenv("APP_ENV", "development"))

    # ── 1. Environment check ──────────────────────────────────────────────────
    required_vars = [
        "GROQ_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "DATABASE_URL",
    ]
    missing = [v for v in required_vars if not os.getenv(v)]
    if missing:
        for var in missing:
            _startup_errors.append(f"Missing required environment variable: {var}")
            log.error("missing_env_var", var=var)
        # Don\'t crash — let the app start so /health can report the error.
        # Routes that need these will fail individually.

    # ── 2. Database tables ────────────────────────────────────────────────────
    try:
        from app.models.database import create_tables, engine
        await create_tables()
        log.info("db_tables_ready")
    except Exception as exc:
        msg = f"Database init failed: {exc}"
        _startup_errors.append(msg)
        log.error("db_init_failed", error=str(exc))

    # Also ensure the chat_sessions table exists (defined in chat_models.py)
    try:
        from app.models.chat_models import ChatSessionModel, Base
        from app.models.database import engine
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info("chat_tables_ready")
    except Exception as exc:
        log.warning("chat_tables_init_failed", error=str(exc))

    # ── 3. Warm up embedding model ────────────────────────────────────────────
    try:
        from app.rag.embedder import Embedder
        embedder = Embedder()
        embedder._get_model()   # triggers download/load, ~2s on warm cache
        log.info("embedding_model_loaded", model=embedder.model_name)
    except Exception as exc:
        msg = f"Embedding model load failed: {exc}"
        _startup_errors.append(msg)
        log.warning("embedding_model_failed", error=str(exc))

    # ── 4. Verify ChromaDB ────────────────────────────────────────────────────
    try:
        from app.rag.vector_store import ChromaVectorStore
        store = ChromaVectorStore()
        stats = store.collection_stats()
        log.info(
            "chromadb_ready",
            collection=stats["collection_name"],
            documents=stats["document_count"],
        )
        if stats["document_count"] == 0:
            log.warning(
                "chromadb_empty",
                hint="Run: python -m backend.tasks.seed_vector_db to populate",
            )
    except Exception as exc:
        msg = f"ChromaDB init failed: {exc}"
        _startup_errors.append(msg)
        log.warning("chromadb_failed", error=str(exc))

    elapsed = round((time.perf_counter() - t_start) * 1000, 1)
    log.info(
        "app_startup_complete",
        elapsed_ms=elapsed,
        errors=len(_startup_errors),
        env=os.getenv("APP_ENV", "development"),
    )

    # ── Yield: app is now serving requests ───────────────────────────────────
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    log.info("app_shutdown_begin")
    try:
        from app.models.database import engine
        await engine.dispose()
        log.info("db_engine_disposed")
    except Exception as exc:
        log.warning("db_dispose_failed", error=str(exc))

    log.info("app_shutdown_complete")


# ═════════════════════════════════════════════════════════════════════════════
#  FastAPI app
# ═════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="GlobalPath AI API",
    description=(
        "Backend for GlobalPath AI — an AI-powered study-abroad advisory chatbot. "
        "Provides chat, RAG retrieval, live web search, and visa/scholarship data."
    ),
    version="0.1.0",
    docs_url="/docs",         # Swagger UI
    redoc_url="/redoc",       # ReDoc
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# ═════════════════════════════════════════════════════════════════════════════
#  Middleware
# ═════════════════════════════════════════════════════════════════════════════

# ── CORS ──────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000",
)
CORS_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# In production add your Vercel frontend URL to CORS_ORIGINS in .env
# e.g. CORS_ORIGINS=https://globalpath.vercel.app,http://localhost:5173

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
        "Cache-Control",
        "Last-Event-ID",     # needed for SSE reconnection
    ],
    expose_headers=["X-Request-ID", "X-Process-Time"],
)

# ── Gzip compression for large responses ─────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ═════════════════════════════════════════════════════════════════════════════
#  Request timing middleware
# ═════════════════════════════════════════════════════════════════════════════

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """
    Attach X-Process-Time header to every response so the frontend
    and monitoring tools can track server-side latency.
    Also generates a per-request ID for log correlation.
    """
    import uuid
    request_id = str(uuid.uuid4())[:8]
    t0         = time.perf_counter()

    # Attach request_id to structlog context for this request
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    response = await call_next(request)

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    response.headers["X-Process-Time"] = f"{elapsed_ms}ms"
    response.headers["X-Request-ID"]   = request_id
    return response


# ═════════════════════════════════════════════════════════════════════════════
#  Global exception handler
# ═════════════════════════════════════════════════════════════════════════════

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all exception handler. Returns a generic 500 in production
    to avoid leaking stack traces; logs the full error server-side.
    """
    log.exception(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error":   "An unexpected error occurred.",
            "detail":  str(exc) if os.getenv("APP_ENV") == "development" else "Internal server error.",
            "path":    request.url.path,
        },
    )


# ═════════════════════════════════════════════════════════════════════════════
#  Routers
# ═════════════════════════════════════════════════════════════════════════════

from app.api.chat_router import router as chat_router
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])

try:
    from app.api.search_router import router as search_router
    app.include_router(search_router, prefix="/api/search", tags=["search"])
    log.info("search_router_registered")
except ImportError as exc:
    log.warning("search_router_not_found", error=str(exc))


# ═════════════════════════════════════════════════════════════════════════════
#  Health check endpoints
# ═════════════════════════════════════════════════════════════════════════════

@app.get(
    "/health",
    tags=["meta"],
    summary="Application health check",
    include_in_schema=True,
)
async def health_check() -> JSONResponse:
    """
    Liveness probe used by Render.com, Docker healthchecks, and monitoring.

    Returns:
        200 with status "healthy" if all systems operational
        207 (Multi-Status) if there were non-fatal startup errors
    """
    db_ok    = False
    chroma_ok = False
    groq_ok   = bool(os.getenv("GROQ_API_KEY"))

    # Quick DB ping
    try:
        from app.models.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await session.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        log.warning("health_db_failed", error=str(exc))

    # Quick ChromaDB check
    try:
        from app.rag.vector_store import ChromaVectorStore
        stats    = ChromaVectorStore().collection_stats()
        chroma_ok = True
        chroma_docs = stats.get("document_count", 0)
    except Exception:
        chroma_docs = 0

    payload = {
        "status":   "healthy" if (db_ok and chroma_ok and groq_ok) else "degraded",
        "version":  "0.1.0",
        "env":      os.getenv("APP_ENV", "development"),
        "services": {
            "database":  "ok" if db_ok  else "unreachable",
            "chromadb":  "ok" if chroma_ok else "unreachable",
            "groq":      "configured" if groq_ok else "missing GROQ_API_KEY",
        },
        "chromadb_documents": chroma_docs if chroma_ok else 0,
        "startup_errors": _startup_errors or None,
    }

    status_code = (
        status.HTTP_200_OK
        if payload["status"] == "healthy"
        else status.HTTP_207_MULTI_STATUS
    )
    return JSONResponse(content=payload, status_code=status_code)


@app.get(
    "/health/ready",
    tags=["meta"],
    summary="Readiness probe — is the app ready to serve traffic?",
    include_in_schema=False,
)
async def readiness_check() -> JSONResponse:
    """
    Kubernetes/Render readiness probe.
    Returns 503 if any critical system (DB) is unavailable.
    """
    try:
        from app.models.database import AsyncSessionLocal
        import sqlalchemy
        async with AsyncSessionLocal() as session:
            await session.execute(sqlalchemy.text("SELECT 1"))
        return JSONResponse({"ready": True}, status_code=200)
    except Exception as exc:
        return JSONResponse(
            {"ready": False, "error": str(exc)},
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


@app.get("/", include_in_schema=False)
async def root() -> JSONResponse:
    """Root endpoint — redirects browser users to the API docs."""
    return JSONResponse({
        "name":    "GlobalPath AI API",
        "version": "0.1.0",
        "docs":    "/docs",
        "health":  "/health",
    })
