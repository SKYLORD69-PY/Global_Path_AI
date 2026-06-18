# backend/Dockerfile
# GlobalPath AI — Production Container
#
# Base:  python:3.11-slim
# Serves the FastAPI backend via uvicorn on $PORT (set by Render / env).
#
# Build:
#   docker build -t globalpath-api -f backend/Dockerfile .
#
# Run locally:
#   docker run -p 8000:8000 --env-file backend/.env globalpath-api

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: dependency builder
# Compiles wheels in a separate layer so the final image doesn't include
# build tools (gcc, cmake, etc.).
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

# Prevent bytecode files and enable stdout/stderr flushing
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System packages needed to compile Python extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        g++ \
        libffi-dev \
        libssl-dev \
        libpq-dev \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY requirements.txt .

# Build all wheels into /build/wheels so the final stage can install offline
RUN pip install --upgrade pip \
 && pip wheel \
        --no-cache-dir \
        --wheel-dir /build/wheels \
        -r requirements.txt


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Playwright: install browsers here, not in /root
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    # sentence-transformers: cache models on a predictable path
    SENTENCE_TRANSFORMERS_HOME=/app/.model-cache \
    # Uvicorn workers
    WEB_CONCURRENCY=1 \
    PORT=8000

# ── System libraries required at runtime ──────────────────────────────────────
# Playwright Chromium deps (minimal subset for headless scraping)
# libpq-dev for psycopg2 / asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
        # Chromium runtime libraries
        libnss3 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libgbm1 \
        libasound2 \
        libpangocairo-1.0-0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libxkbcommon0 \
        libgtk-3-0 \
        # PostgreSQL client library
        libpq5 \
        # Fonts (required for headless Chromium rendering)
        fonts-liberation \
        # Network utilities
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Install Python wheels from the builder stage ──────────────────────────────
COPY --from=builder /build/wheels /tmp/wheels
RUN pip install --no-cache-dir --no-index --find-links /tmp/wheels \
        $(ls /tmp/wheels/*.whl | xargs -I{} basename {} | \
          sed 's/-[^-]*-[^-]*-[^-]*.whl//' | tr '_' '-') \
    2>/dev/null || \
    # Fallback: install directly from the wheels directory
    pip install --no-cache-dir --find-links /tmp/wheels /tmp/wheels/*.whl \
 && rm -rf /tmp/wheels

# ── Install Playwright and download Chromium ───────────────────────────────────
RUN pip install --no-cache-dir playwright \
 && playwright install chromium \
 && playwright install-deps chromium

# ── Create a non-root user for security ───────────────────────────────────────
RUN groupadd --gid 1001 appgroup \
 && useradd  --uid 1001 --gid appgroup \
             --no-create-home --shell /bin/false \
             appuser \
 && mkdir -p /app /app/.model-cache /data/chroma \
 && chown -R appuser:appgroup /app /data /ms-playwright 2>/dev/null || true

# ── Copy application source code ───────────────────────────────────────────────
WORKDIR /app

COPY --chown=appuser:appgroup . .

# Switch to non-root user
USER appuser

# ── Expose port (Render / Docker will override via $PORT env var) ─────────────
EXPOSE ${PORT}

# ── Health check ──────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# ── Entrypoint ────────────────────────────────────────────────────────────────
CMD ["sh", "-c", \
     "uvicorn app.main:app \
       --host 0.0.0.0 \
       --port ${PORT} \
       --workers ${WEB_CONCURRENCY} \
       --log-level info \
       --access-log"]
