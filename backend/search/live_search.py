"""
GlobalPath AI — Live Web Search Client
=======================================
Wraps the duckduckgo-search Python package for real-time web search.

Why DuckDuckGo?
  - No API key required
  - No rate-limit charges
  - Completely free
  - Returns title + snippet + URL for each result
  - DDGS is the official async-capable interface

Install:  pip install duckduckgo-search

All search methods follow this pattern:
  1. Build a tightly targeted search query string
  2. Check Upstash Redis cache — return immediately on hit
  3. Call DDGS().text() in a thread pool (DDGS is sync-only)
  4. Parse + normalise results into {title, snippet, url} dicts
  5. Cache the results with the appropriate TTL

TTLs:
  Scholarships   86400 s  (1 day)
  Visa           43200 s  (12 hours)
  Universities   604800 s (7 days)
  Cost of living 2592000 s (30 days)

Usage:
    client  = LiveSearchClient()
    results, cached = await client.search_visa_requirements("India", "United Kingdom")
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import structlog
from duckduckgo_search import DDGS
from duckduckgo_search.exceptions import DuckDuckGoSearchException

from app.cache.redis_client import (
    UpstashCache,
    TTL_SCHOLARSHIP,
    TTL_VISA,
    TTL_UNIVERSITY,
    TTL_COST_OF_LIVING,
)

log = structlog.get_logger(__name__)

DEFAULT_NUM_RESULTS = 5
MAX_NUM_RESULTS     = 10
SEARCH_TIMEOUT_S    = 15
CACHE_KEY_PREFIX    = "search"

_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ddgs")


class LiveSearchClient:
    """
    Async DuckDuckGo search client with Upstash Redis caching.

    All public search_*() methods are async and cache-aware.
    DDGS is synchronous so calls run in a thread pool to avoid blocking
    the FastAPI event loop.
    """

    def __init__(self, cache: UpstashCache | None = None) -> None:
        self.cache = cache or UpstashCache()
        self.log   = structlog.get_logger(component="LiveSearchClient")

    # ── Low-level search ──────────────────────────────────────────────────────

    async def search(
        self,
        query:       str,
        num_results: int = DEFAULT_NUM_RESULTS,
    ) -> list[dict[str, str]]:
        """
        Execute a DuckDuckGo text search and return normalised results.

        Runs DDGS().text() in a thread-pool executor so it does not block
        the async event loop.

        Args:
            query:       Raw search query string.
            num_results: Number of results to request (capped at 10).

        Returns:
            List of {"title": str, "snippet": str, "url": str} dicts.
            Returns [] on any error — errors are logged, never raised.
        """
        num_results = min(num_results, MAX_NUM_RESULTS)

        if not query or not query.strip():
            self.log.warning("search_empty_query")
            return []

        self.log.info("ddgs_search", query=query[:120], num_results=num_results)
        t0   = time.perf_counter()
        loop = asyncio.get_running_loop()

        try:
            raw_results: list[dict] = await asyncio.wait_for(
                loop.run_in_executor(_EXECUTOR, self._ddgs_text_sync, query, num_results),
                timeout=SEARCH_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            self.log.warning("ddgs_timeout", query=query[:80], timeout_s=SEARCH_TIMEOUT_S)
            return []
        except DuckDuckGoSearchException as exc:
            self.log.warning("ddgs_exception", query=query[:80], error=str(exc))
            return []
        except Exception as exc:
            self.log.error("ddgs_unexpected_error", query=query[:80], error=str(exc))
            return []

        results = self._normalise_results(raw_results)
        elapsed = round((time.perf_counter() - t0) * 1000, 1)
        self.log.info("ddgs_done", results=len(results), elapsed_ms=elapsed)
        return results

    @staticmethod
    def _ddgs_text_sync(query: str, num_results: int) -> list[dict]:
        """
        Synchronous DDGS call — runs inside ThreadPoolExecutor.
        Returns raw DDGS result dicts or [] on failure.
        """
        try:
            with DDGS() as ddgs:
                return list(ddgs.text(
                    query,
                    max_results=num_results,
                    safesearch="moderate",
                ))
        except Exception:
            return []

    @staticmethod
    def _normalise_results(raw: list[dict]) -> list[dict[str, str]]:
        """
        Normalise DDGS raw dicts to consistent {title, snippet, url}.

        DDGS returns: {"title": ..., "body": ..., "href": ...}
        We rename:    body -> snippet,  href -> url
        """
        normalised = []
        for item in raw:
            title   = (item.get("title")  or "").strip()
            snippet = (item.get("body")   or item.get("snippet") or "").strip()
            url     = (item.get("href")   or item.get("url")     or "").strip()
            if url:
                normalised.append({"title": title, "snippet": snippet, "url": url})
        return normalised

    # ── Cache helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _cache_key(*parts: str) -> str:
        """
        Build a deterministic Redis key. Hashes long keys to stay
        well under Redis\'s 512-byte key limit.
        """
        joined = UpstashCache.build_key(CACHE_KEY_PREFIX, *parts)
        if len(joined) > 200:
            digest = hashlib.md5(joined.encode()).hexdigest()[:16]
            return f"{CACHE_KEY_PREFIX}:hashed:{digest}"
        return joined

    async def _cached_search(
        self,
        cache_key:   str,
        query:       str,
        ttl:         int,
        num_results: int = DEFAULT_NUM_RESULTS,
    ) -> tuple[list[dict[str, str]], bool]:
        """
        Cache-aside pattern: check cache first, run live search on miss.

        Returns:
            (results, was_cached) — callers surface was_cached in API responses.
        """
        cached = await self.cache.get(cache_key)
        if cached is not None:
            self.log.info("search_cache_hit", key=cache_key)
            return cached, True

        results = await self.search(query, num_results=num_results)

        # Only cache non-empty results to avoid poisoning the cache
        if results:
            await self.cache.set(cache_key, results, ttl=ttl)

        return results, False

    # ── Domain-specific search methods ───────────────────────────────────────

    async def search_scholarships(
        self,
        country:        str,
        field_of_study: str = "",
        degree_level:   str = "",
        num_results:    int = DEFAULT_NUM_RESULTS,
    ) -> tuple[list[dict[str, str]], bool]:
        """
        Search for international scholarships matching the given criteria.

        Builds a targeted query that surfaces scholarship databases,
        official government pages, and university financial-aid pages.

        Args:
            country:        Destination country (e.g. "United Kingdom").
            field_of_study: Academic subject (e.g. "computer science").
            degree_level:   "bachelors", "masters", or "phd".

        Returns:
            (results, was_cached)
        """
        parts = ["scholarships"]

        if degree_level:
            label = {
                "bachelors": "undergraduate",
                "masters":   "masters",
                "phd":       "PhD",
            }.get(degree_level.lower(), degree_level)
            parts.append(label)

        if field_of_study:
            parts.append(field_of_study)

        if country:
            parts.append(f"in {country}")

        query     = " ".join(parts)
        cache_key = self._cache_key("scholarship", country, field_of_study, degree_level)

        self.log.info(
            "search_scholarships",
            country=country, field=field_of_study, degree=degree_level,
        )
        return await self._cached_search(cache_key, query, TTL_SCHOLARSHIP, num_results)

    async def search_visa_requirements(
        self,
        from_country: str,
        to_country:   str,
        num_results:  int = DEFAULT_NUM_RESULTS,
    ) -> tuple[list[dict[str, str]], bool]:
        """
        Search for student visa requirements for a specific country pair.

        Builds a query targeting official government immigration sites.

        Args:
            from_country: Applicant nationality / home country.
            to_country:   Destination / host country.

        Returns:
            (results, was_cached)
        """
        query = f"student visa requirements {from_country} to {to_country}"
        cache_key = self._cache_key("visa", from_country, to_country)

        self.log.info("search_visa", from_country=from_country, to_country=to_country)
        return await self._cached_search(cache_key, query, TTL_VISA, num_results)

    async def search_universities(
        self,
        country:      str,
        subject:      str = "",
        degree_level: str = "",
        num_results:  int = DEFAULT_NUM_RESULTS,
    ) -> tuple[list[dict[str, str]], bool]:
        """
        Search for top universities in a country for a given subject.

        Targets ranking sites (QS, THE, US News) and official university pages.

        Returns:
            (results, was_cached)
        """
        parts = ["top universities"]
        if subject:
            parts.append(subject)
        if degree_level:
            parts.append(degree_level)
        if country:
            parts.append(f"in {country}")

        query     = " ".join(parts)
        cache_key = self._cache_key("universities", country, subject, degree_level)

        self.log.info("search_universities", country=country, subject=subject, degree=degree_level)
        return await self._cached_search(cache_key, query, TTL_UNIVERSITY, num_results)

    async def search_cost_of_living(
        self,
        city:        str,
        country:     str,
        num_results: int = DEFAULT_NUM_RESULTS,
    ) -> tuple[list[dict[str, str]], bool]:
        """
        Search for student cost-of-living information for a city.

        Targets Numbeo, Expatistan, and official university accommodation pages.

        Returns:
            (results, was_cached)
        """
        location  = f"{city} {country}".strip()
        query     = (
            f"student cost of living {location} 2025 monthly expenses "
            f"rent accommodation food transport international student budget"
        )
        cache_key = self._cache_key("cost-of-living", city, country)

        self.log.info("search_cost_of_living", city=city, country=country)
        return await self._cached_search(cache_key, query, TTL_COST_OF_LIVING, num_results)

    async def search_general(
        self,
        query:       str,
        num_results: int = DEFAULT_NUM_RESULTS,
        ttl:         int = TTL_VISA,
    ) -> tuple[list[dict[str, str]], bool]:
        """
        General-purpose cached search for ad-hoc queries from the chat layer.

        Returns:
            (results, was_cached)
        """
        cache_key = self._cache_key("general", query[:120])
        return await self._cached_search(cache_key, query, ttl, num_results)
