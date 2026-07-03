"""
GlobalPath AI — Upstash Redis Cache Client
===========================================
HTTP-based Redis cache using the upstash-redis Python SDK.

Why upstash-redis and not redis-py?
  Upstash's free tier exposes Redis over a REST/HTTP API.
  Standard redis-py requires a persistent TCP socket which doesn't work
  with Upstash's serverless model. The upstash-redis SDK wraps every
  command as an authenticated HTTPS request — no TCP, no persistent
  connection, works from any environment including Render's free tier.

Environment variables required (in backend/.env):
  UPSTASH_REDIS_REST_URL   = https://your-db.upstash.io
  UPSTASH_REDIS_REST_TOKEN = AXyz...

Usage:
    cache = UpstashCache()
    await cache.set("my:key", {"hello": "world"}, ttl=3600)
    data  = await cache.get("my:key")          # {"hello": "world"}
    await cache.delete("my:key")
    await cache.flush_pattern("search:visa:*")
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
import structlog
from dotenv import load_dotenv

load_dotenv()

log = structlog.get_logger(__name__)

# ─── TTL presets (seconds) — import from here in live_search.py ──────────────
TTL_SCHOLARSHIP    = 86_400       #  1 day
TTL_VISA           = 43_200       # 12 hours
TTL_UNIVERSITY     = 604_800      #  7 days
TTL_COST_OF_LIVING = 2_592_000    # 30 days


class UpstashCache:
    """
    Async Redis cache backed by Upstash's HTTP REST API.

    All values are transparently JSON-serialised on write and
    deserialised on read — callers always work with Python objects.
    Share one instance across FastAPI request handlers (fully async-safe).
    """

    def __init__(self) -> None:
        self._url   = os.getenv("UPSTASH_REDIS_REST_URL", "")
        self._token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
        self.log    = structlog.get_logger(component="UpstashCache")

        if not self._url or not self._token:
            self.log.warning(
                "upstash_not_configured",
                hint="Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env",
            )

    # ── Client ─────────────────────────────────────────────────────────────────

    async def _execute(self, *command: Any) -> Any:
        if not self._url or not self._token:
            raise RuntimeError(
                "Upstash Redis is not configured. "
                "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env"
            )

        endpoint = self._url.rstrip("/")
        headers = {"Authorization": f"Bearer {self._token}"}
        payload = list(command)

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            body = response.json()
        return body.get("result")

    # ── Serialisation ─────────────────────────────────────────────────────────

    @staticmethod
    def _serialise(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, default=str)

    @staticmethod
    def _deserialise(raw: str | None) -> Any:
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw   # plain string stored directly

    # ── Core operations ────────────────────────────────────────────────────────

    async def get(self, key: str) -> Any | None:
        """
        Retrieve a cached value by key.
        Returns None if the key doesn't exist, has expired, or on any error.
        """
        try:
            raw   = await self._execute("GET", key)
            value = self._deserialise(raw)
            self.log.debug("cache_hit" if value is not None else "cache_miss", key=key)
            return value
        except RuntimeError:
            return None
        except Exception as exc:
            self.log.warning("cache_get_error", key=key, error=str(exc))
            return None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> bool:
        """
        Store a value in the cache.

        Args:
            key:   Redis key.
            value: Any JSON-serialisable Python object.
            ttl:   Time-to-live in seconds. None = no expiry.

        Returns:
            True on success, False on any failure.
        """
        try:
            serialised = self._serialise(value)
            if ttl is not None:
                await self._execute("SET", key, serialised, "EX", ttl)
            else:
                await self._execute("SET", key, serialised)

            self.log.debug("cache_set", key=key, ttl=ttl, bytes=len(serialised))
            return True
        except RuntimeError:
            return False
        except Exception as exc:
            self.log.warning("cache_set_error", key=key, error=str(exc))
            return False

    async def delete(self, key: str) -> bool:
        """Delete a single key. Returns True if deleted."""
        try:
            deleted = await self._execute("DEL", key)
            self.log.debug("cache_delete", key=key, deleted=deleted)
            return bool(deleted)
        except Exception as exc:
            self.log.warning("cache_delete_error", key=key, error=str(exc))
            return False

    async def exists(self, key: str) -> bool:
        """Return True if the key exists and hasn't expired."""
        try:
            return bool(await self._execute("EXISTS", key))
        except Exception:
            return False

    async def ttl(self, key: str) -> int:
        """
        Return remaining TTL in seconds.
        -1 = no expiry set, -2 = key doesn't exist.
        """
        try:
            return int(await self._execute("TTL", key))
        except Exception:
            return -2

    # ── Pattern flush ──────────────────────────────────────────────────────────

    async def flush_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching a glob pattern using SCAN (non-blocking).

        Args:
            pattern: Redis glob, e.g. "search:visa:*"

        Returns:
            Number of keys deleted.
        """
        try:
            deleted = 0
            cursor  = 0

            self.log.info("flush_pattern_start", pattern=pattern)

            while True:
                result = await self._execute("SCAN", cursor, "MATCH", pattern, "COUNT", 100)
                cursor = int((result or ["0", []])[0])
                keys = (result or ["0", []])[1]
                if keys:
                    await self._execute("DEL", *keys)
                    deleted += len(keys)
                if cursor == 0:
                    break

            self.log.info("flush_pattern_done", pattern=pattern, deleted=deleted)
            return deleted

        except RuntimeError:
            return 0
        except Exception as exc:
            self.log.warning("flush_pattern_error", pattern=pattern, error=str(exc))
            return 0

    async def flush_all_search_cache(self) -> int:
        """Clear all GlobalPath search result caches."""
        return await self.flush_pattern("search:*")

    # ── Key builder ────────────────────────────────────────────────────────────

    @staticmethod
    def build_key(*parts: str) -> str:
        """
        Build a consistent, lowercased namespaced Redis key.

        Example:
            build_key("search", "visa", "India", "United Kingdom")
            → "search:visa:india:united kingdom"
        """
        cleaned = []
        for part in parts:
            if not part:
                continue
            normalised = "-".join(part.strip().lower().split())
            if normalised:
                cleaned.append(normalised)
        return ":".join(cleaned)
