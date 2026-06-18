#!/usr/bin/env python3
"""
backend/scripts/health_check.py
=================================
Checks all GlobalPath AI external dependencies and prints a status table.

Services checked (free-tier stack only — no Pinecone, no Clerk):
  1. PostgreSQL / Supabase   — async connection + simple SELECT 1
  2. ChromaDB                — local PersistentClient, collection exists
  3. Upstash Redis           — HTTP REST PING command
  4. Groq API                — 1-token completion to verify key validity

Exit codes:
  0  — all services healthy
  1  — one or more services failed (use in CI / Render health scripts)

Usage:
  cd backend
  python scripts/health_check.py

  # CI / Render post-deploy check:
  python scripts/health_check.py && echo "All systems go" || exit 1

  # Verbose mode (shows error tracebacks):
  python scripts/health_check.py --verbose
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
import traceback
from dataclasses import dataclass, field
from typing import Callable, Awaitable

# ── Load .env early so env vars are available before any imports ───────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed in production — env vars come from Render

# ─── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    service:    str
    status:     str = "UNKNOWN"    # "OK" | "FAIL" | "SKIP"
    latency_ms: float = 0.0
    detail:     str = ""
    exc:        str = ""           # populated on failure (for --verbose)

    @property
    def ok(self) -> bool:
        return self.status == "OK"

    @property
    def status_icon(self) -> str:
        return {"OK": "✅", "FAIL": "❌", "SKIP": "⚠️"}.get(self.status, "❓")


# ─── Individual check functions ───────────────────────────────────────────────

async def check_postgres() -> CheckResult:
    """
    Connect to Supabase PostgreSQL via DATABASE_URL and run SELECT 1.
    Uses asyncpg for a fast async check.
    """
    result = CheckResult(service="PostgreSQL / Supabase")
    url    = os.getenv("DATABASE_URL", "")

    if not url:
        result.status = "SKIP"
        result.detail = "DATABASE_URL not set"
        return result

    t0 = time.perf_counter()
    try:
        import asyncpg  # type: ignore

        # asyncpg expects postgresql:// not postgres://
        conn_url = url.replace("postgres://", "postgresql://") \
                       .replace("+asyncpg", "") \
                       .replace("+aiosqlite", "")

        conn = await asyncio.wait_for(
            asyncpg.connect(conn_url, timeout=8),
            timeout=10,
        )
        await conn.fetchval("SELECT 1")
        await conn.close()

        result.status     = "OK"
        result.latency_ms = (time.perf_counter() - t0) * 1000
        result.detail     = "SELECT 1 succeeded"

    except asyncpg.exceptions.InvalidPasswordError:
        result.status = "FAIL"
        result.detail = "Authentication failed — check DATABASE_URL credentials"
        result.exc    = traceback.format_exc()
    except asyncio.TimeoutError:
        result.status = "FAIL"
        result.detail = "Connection timed out (>10 s)"
        result.exc    = traceback.format_exc()
    except ImportError:
        # asyncpg not installed — try psycopg2 synchronously
        try:
            import psycopg2  # type: ignore
            t1   = time.perf_counter()
            conn = psycopg2.connect(dsn=url, connect_timeout=8)
            cur  = conn.cursor()
            cur.execute("SELECT 1")
            conn.close()
            result.status     = "OK"
            result.latency_ms = (time.perf_counter() - t1) * 1000
            result.detail     = "SELECT 1 succeeded (psycopg2)"
        except Exception as e:
            result.status = "FAIL"
            result.detail = str(e)[:120]
            result.exc    = traceback.format_exc()
    except Exception as e:
        result.status = "FAIL"
        result.detail = str(e)[:120]
        result.exc    = traceback.format_exc()

    return result


async def check_chromadb() -> CheckResult:
    """
    Open the local ChromaDB PersistentClient and verify the
    'globalpath-knowledge' collection exists.
    """
    result      = CheckResult(service="ChromaDB (local)")
    persist_dir = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")

    t0 = time.perf_counter()
    try:
        import chromadb  # type: ignore

        client = chromadb.PersistentClient(path=persist_dir)

        # list_collections() returns a list of Collection objects
        collections = client.list_collections()
        col_names   = [c.name for c in collections]

        target = "globalpath-knowledge"
        if target in col_names:
            col   = client.get_collection(target)
            count = col.count()
            result.status     = "OK"
            result.detail     = f"Collection '{target}' exists — {count:,} documents"
        else:
            # Collection not yet seeded — warn but don't fail hard
            result.status = "SKIP"
            result.detail = (
                f"Collection '{target}' not found. "
                f"Found: {col_names or ['(none)']}. "
                f"Run the seed / embed pipeline first."
            )

        result.latency_ms = (time.perf_counter() - t0) * 1000

    except Exception as e:
        result.status     = "FAIL"
        result.latency_ms = (time.perf_counter() - t0) * 1000
        result.detail     = str(e)[:120]
        result.exc        = traceback.format_exc()

    return result


async def check_upstash_redis() -> CheckResult:
    """
    Send a PING command to Upstash Redis via the HTTP REST API.
    Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
    """
    result = CheckResult(service="Upstash Redis")
    url    = os.getenv("UPSTASH_REDIS_REST_URL",   "")
    token  = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")

    if not url or not token:
        result.status = "SKIP"
        result.detail = "UPSTASH_REDIS_REST_URL or TOKEN not set"
        return result

    t0 = time.perf_counter()
    try:
        import httpx  # type: ignore

        # Upstash REST API: POST /ping  →  {"result":"PONG"}
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{url.rstrip('/')}/ping",
                headers={"Authorization": f"Bearer {token}"},
            )

        result.latency_ms = (time.perf_counter() - t0) * 1000

        if resp.status_code == 200:
            body = resp.json()
            if body.get("result") == "PONG":
                result.status = "OK"
                result.detail = "PONG received"
            else:
                result.status = "FAIL"
                result.detail = f"Unexpected response: {body}"
        else:
            result.status = "FAIL"
            result.detail = f"HTTP {resp.status_code}: {resp.text[:80]}"

    except Exception as e:
        result.status     = "FAIL"
        result.latency_ms = (time.perf_counter() - t0) * 1000
        result.detail     = str(e)[:120]
        result.exc        = traceback.format_exc()

    return result


async def check_groq_api() -> CheckResult:
    """
    Make a minimal 1-token Groq completion to verify the API key is valid.
    Uses the smallest/fastest model to minimise cost and latency.
    """
    result  = CheckResult(service="Groq API (LLM)")
    api_key = os.getenv("GROQ_API_KEY", "")

    if not api_key:
        result.status = "SKIP"
        result.detail = "GROQ_API_KEY not set"
        return result

    t0 = time.perf_counter()
    try:
        import httpx  # type: ignore

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model":      "llama-3.1-8b-instant",   # smallest + fastest
                    "messages":   [{"role": "user", "content": "Hi"}],
                    "max_tokens": 1,
                    "temperature": 0,
                },
            )

        result.latency_ms = (time.perf_counter() - t0) * 1000

        if resp.status_code == 200:
            body  = resp.json()
            model = body.get("model", "unknown")
            result.status = "OK"
            result.detail = f"Response from {model}"
        elif resp.status_code == 401:
            result.status = "FAIL"
            result.detail = "Invalid API key (HTTP 401)"
        elif resp.status_code == 429:
            # Rate-limited means the key is valid — treat as OK
            result.status = "OK"
            result.detail = "API key valid (rate-limited — HTTP 429)"
        else:
            result.status = "FAIL"
            result.detail = f"HTTP {resp.status_code}: {resp.text[:80]}"

    except Exception as e:
        result.status     = "FAIL"
        result.latency_ms = (time.perf_counter() - t0) * 1000
        result.detail     = str(e)[:120]
        result.exc        = traceback.format_exc()

    return result


# ─── Table printer ────────────────────────────────────────────────────────────

# ANSI colour codes
_GREEN  = "\033[92m"
_RED    = "\033[91m"
_YELLOW = "\033[93m"
_RESET  = "\033[0m"
_BOLD   = "\033[1m"
_DIM    = "\033[2m"

def _coloured(text: str, colour: str, use_colour: bool) -> str:
    return f"{colour}{text}{_RESET}" if use_colour else text


def print_results(
    results:     list[CheckResult],
    verbose:     bool = False,
    use_colour:  bool = True,
) -> None:
    """
    Print a formatted status table to stdout.

    Example:
    ┌─────────────────────────────────┬────────┬────────────┬──────────────────────────────────┐
    │ Service                         │ Status │ Latency    │ Detail                           │
    ├─────────────────────────────────┼────────┼────────────┼──────────────────────────────────┤
    │ PostgreSQL / Supabase           │ ✅ OK  │    42.3 ms │ SELECT 1 succeeded               │
    │ ChromaDB (local)                │ ✅ OK  │     3.1 ms │ Collection exists — 1,240 docs   │
    │ Upstash Redis                   │ ✅ OK  │    88.6 ms │ PONG received                    │
    │ Groq API (LLM)                  │ ✅ OK  │   341.2 ms │ Response from llama-3.1-8b       │
    └─────────────────────────────────┴────────┴────────────┴──────────────────────────────────┘
    """
    # Column widths
    W_SVC    = max(len(r.service) for r in results) + 2
    W_STATUS = 8
    W_LAT    = 11
    W_DETAIL = 42

    sep   = f"{'─' * W_SVC}┼{'─' * W_STATUS}┼{'─' * W_LAT}┼{'─' * W_DETAIL}"
    top   = f"{'─' * W_SVC}┬{'─' * W_STATUS}┬{'─' * W_LAT}┬{'─' * W_DETAIL}"
    bot   = f"{'─' * W_SVC}┴{'─' * W_STATUS}┴{'─' * W_LAT}┴{'─' * W_DETAIL}"
    hdr   = (
        f"{'Service'.ljust(W_SVC - 1)} │ "
        f"{'Status'.ljust(W_STATUS - 2)} │ "
        f"{'Latency'.rjust(W_LAT - 2)} │ "
        f"{'Detail'}"
    )

    print()
    print(_coloured("GlobalPath AI — Service Health Check", _BOLD, use_colour))
    print()
    print(f"┌{top}┐")
    print(f"│ {hdr} │")
    print(f"├{sep}┤")

    for r in results:
        colour = {"OK": _GREEN, "FAIL": _RED, "SKIP": _YELLOW}.get(r.status, "")
        status_str = f"{r.status_icon} {r.status}".ljust(W_STATUS - 1)
        status_str = _coloured(status_str, colour, use_colour)

        lat_str  = f"{r.latency_ms:>7.1f} ms" if r.latency_ms else "      — ms"
        svc_str  = r.service.ljust(W_SVC - 1)
        detail   = r.detail[:W_DETAIL - 1]

        print(f"│ {svc_str} │ {status_str} │ {lat_str} │ {detail.ljust(W_DETAIL - 1)} │")

    print(f"└{bot}┘")

    # Summary line
    n_ok   = sum(1 for r in results if r.ok)
    n_fail = sum(1 for r in results if r.status == "FAIL")
    n_skip = sum(1 for r in results if r.status == "SKIP")

    parts  = []
    if n_ok:   parts.append(_coloured(f"{n_ok} OK",     _GREEN,  use_colour))
    if n_fail: parts.append(_coloured(f"{n_fail} FAILED", _RED,  use_colour))
    if n_skip: parts.append(_coloured(f"{n_skip} SKIPPED", _YELLOW, use_colour))
    print(f"\n  {' · '.join(parts)}\n")

    # Verbose error output
    if verbose:
        failed = [r for r in results if r.status == "FAIL" and r.exc]
        if failed:
            print(_coloured("─── Error details ───────────────────", _DIM, use_colour))
            for r in failed:
                print(f"\n{_coloured(r.service, _RED, use_colour)}:")
                print(r.exc)


# ─── Main ─────────────────────────────────────────────────────────────────────

CHECKS: list[tuple[str, Callable[[], Awaitable[CheckResult]]]] = [
    ("PostgreSQL / Supabase", check_postgres),
    ("ChromaDB (local)",      check_chromadb),
    ("Upstash Redis",         check_upstash_redis),
    ("Groq API (LLM)",        check_groq_api),
]


async def run_all_checks(parallel: bool = True) -> list[CheckResult]:
    """
    Run all health checks.
    parallel=True (default): all run concurrently for speed.
    parallel=False: run sequentially (useful when debugging timeouts).
    """
    if parallel:
        results = await asyncio.gather(
            *[fn() for _, fn in CHECKS],
            return_exceptions=False,
        )
        return list(results)
    else:
        results = []
        for _, fn in CHECKS:
            results.append(await fn())
        return results


def main() -> int:
    parser = argparse.ArgumentParser(
        description="GlobalPath AI — service health checker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Print full error tracebacks for failed checks",
    )
    parser.add_argument(
        "--sequential", "-s",
        action="store_true",
        help="Run checks sequentially instead of in parallel",
    )
    parser.add_argument(
        "--no-colour", "--no-color",
        action="store_true",
        help="Disable ANSI colour output (useful for CI logs)",
    )
    args = parser.parse_args()

    # Disable colour when not outputting to a real terminal
    use_colour = not args.no_colour and sys.stdout.isatty()

    print(f"\nChecking {len(CHECKS)} services…", flush=True)
    t_start  = time.perf_counter()

    results  = asyncio.run(run_all_checks(parallel=not args.sequential))

    t_total  = (time.perf_counter() - t_start) * 1000

    print_results(results, verbose=args.verbose, use_colour=use_colour)
    print(f"  Total check time: {t_total:.0f} ms\n")

    any_failed = any(r.status == "FAIL" for r in results)
    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(main())
