"""
GlobalPath AI — Search API Router
====================================
FastAPI router exposing live DuckDuckGo search endpoints.

All endpoints follow the same contract:
  - Check Upstash Redis cache first (cache hit returns instantly)
  - Run live DDGS search on cache miss
  - Return {results, citations, cached, query_time_ms, query}

Mount in app/main.py:
    from app.api.search_router import router as search_router
    app.include_router(search_router, prefix="/api/search", tags=["search"])

Endpoints:
    GET /api/search/scholarships?country=UK&field=cs&degree=masters
    GET /api/search/visa?from=India&to=United+Kingdom
    GET /api/search/universities?country=Germany&subject=engineering&degree=phd
    GET /api/search/cost-of-living?city=Berlin&country=Germany
    DELETE /api/search/cache          — flush entire search cache
    DELETE /api/search/cache/{pattern} — flush matching keys
    GET  /api/search/health           — liveness check
"""

from __future__ import annotations

import time
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.cache.redis_client import UpstashCache
from app.search.live_search import LiveSearchClient
from app.search.result_formatter import SearchResultFormatter

log = structlog.get_logger(__name__)

router = APIRouter(tags=["search"])

# ─── Shared singleton instances ───────────────────────────────────────────────
# FastAPI reuses these across requests — avoids reconstructing clients per call

_cache     = UpstashCache()
_searcher  = LiveSearchClient(cache=_cache)
_formatter = SearchResultFormatter()


# ─── Dependencies ─────────────────────────────────────────────────────────────

def get_search_client() -> LiveSearchClient:
    return _searcher

def get_formatter() -> SearchResultFormatter:
    return _formatter


# ─── Response builder ─────────────────────────────────────────────────────────

def _build_response(
    results:        list[dict[str, str]],
    was_cached:     bool,
    elapsed_ms:     float,
    query_type:     str,
    original_query: str = "",
) -> dict[str, Any]:
    """Build the standard search API response envelope."""
    formatted = _formatter.format_full(results, query_type=query_type)
    return {
        "results":       results,
        "citations":     formatted["citations"],
        "llm_context":   formatted["llm_context"],
        "cached":        was_cached,
        "query_time_ms": round(elapsed_ms, 1),
        "result_count":  len(results),
        "query":         original_query,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get(
    "/scholarships",
    summary="Search for international scholarships",
    response_description="Scholarship search results with citations and LLM context",
)
async def search_scholarships(
    country:  str = Query("", description="Destination country (e.g. United Kingdom)"),
    field:    str = Query("", description="Field of study (e.g. computer science)"),
    degree:   str = Query("", description="Degree level: bachelors | masters | phd"),
    n:        int = Query(5,  ge=1, le=10, description="Number of results (1-10)"),
    client:   LiveSearchClient = Depends(get_search_client),
) -> JSONResponse:
    """
    Search for international scholarships matching the given criteria.

    Results are cached for 24 hours (86400 s) in Upstash Redis.
    """
    if not country and not field and not degree:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one of: country, field, or degree.",
        )

    t0 = time.perf_counter()
    try:
        results, was_cached = await client.search_scholarships(
            country=country,
            field_of_study=field,
            degree_level=degree,
            num_results=n,
        )
    except Exception as exc:
        log.error("endpoint_scholarships_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Search service temporarily unavailable.")

    elapsed = (time.perf_counter() - t0) * 1000
    query   = f"scholarships {degree} {field} {country}".strip()

    log.info(
        "endpoint_scholarships",
        country=country, field=field, degree=degree,
        results=len(results), cached=was_cached, ms=round(elapsed, 1),
    )
    return JSONResponse(_build_response(results, was_cached, elapsed, "scholarship", query))


@router.get(
    "/visa",
    summary="Search for student visa requirements",
    response_description="Visa requirement results from official government sources",
)
async def search_visa(
    from_country: str = Query(..., alias="from", description="Applicant home country"),
    to_country:   str = Query(..., alias="to",   description="Destination country"),
    n:            int = Query(5, ge=1, le=10,   description="Number of results (1-10)"),
    client:       LiveSearchClient = Depends(get_search_client),
) -> JSONResponse:
    """
    Search for student visa requirements for a specific country pair.

    Results are cached for 12 hours (43200 s) in Upstash Redis.
    """
    if not from_country or not to_country:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both `from` (home country) and `to` (destination) are required.",
        )

    t0 = time.perf_counter()
    try:
        results, was_cached = await client.search_visa_requirements(
            from_country=from_country,
            to_country=to_country,
            num_results=n,
        )
    except Exception as exc:
        log.error("endpoint_visa_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Search service temporarily unavailable.")

    elapsed = (time.perf_counter() - t0) * 1000
    query   = f"student visa {from_country} to {to_country}"

    log.info(
        "endpoint_visa",
        from_country=from_country, to_country=to_country,
        results=len(results), cached=was_cached, ms=round(elapsed, 1),
    )
    return JSONResponse(_build_response(results, was_cached, elapsed, "visa", query))


@router.get(
    "/universities",
    summary="Search for universities by country and subject",
    response_description="University and program information",
)
async def search_universities(
    country:  str = Query("", description="Destination country"),
    subject:  str = Query("", description="Academic subject or discipline"),
    degree:   str = Query("", description="Degree level: bachelors | masters | phd"),
    n:        int = Query(5, ge=1, le=10, description="Number of results (1-10)"),
    client:   LiveSearchClient = Depends(get_search_client),
) -> JSONResponse:
    """
    Search for top universities in a country for a given subject and degree level.

    Results are cached for 7 days (604800 s) in Upstash Redis.
    """
    if not country and not subject:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one of: country or subject.",
        )

    t0 = time.perf_counter()
    try:
        results, was_cached = await client.search_universities(
            country=country,
            subject=subject,
            degree_level=degree,
            num_results=n,
        )
    except Exception as exc:
        log.error("endpoint_universities_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Search service temporarily unavailable.")

    elapsed = (time.perf_counter() - t0) * 1000
    query   = f"universities {degree} {subject} {country}".strip()

    log.info(
        "endpoint_universities",
        country=country, subject=subject, degree=degree,
        results=len(results), cached=was_cached, ms=round(elapsed, 1),
    )
    return JSONResponse(_build_response(results, was_cached, elapsed, "university", query))


@router.get(
    "/cost-of-living",
    summary="Search for student cost of living",
    response_description="Cost of living data for students in the target city",
)
async def search_cost_of_living(
    city:    str = Query(..., description="City name (e.g. Berlin, Toronto)"),
    country: str = Query("",  description="Country name for disambiguation"),
    n:       int = Query(5, ge=1, le=10, description="Number of results (1-10)"),
    client:  LiveSearchClient = Depends(get_search_client),
) -> JSONResponse:
    """
    Search for student living cost estimates in a city.

    Results are cached for 30 days (2592000 s) in Upstash Redis.
    """
    if not city:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`city` is required.",
        )

    t0 = time.perf_counter()
    try:
        results, was_cached = await client.search_cost_of_living(
            city=city,
            country=country,
            num_results=n,
        )
    except Exception as exc:
        log.error("endpoint_cost_of_living_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Search service temporarily unavailable.")

    elapsed = (time.perf_counter() - t0) * 1000
    query   = f"student cost of living {city} {country}".strip()

    log.info(
        "endpoint_cost_of_living",
        city=city, country=country,
        results=len(results), cached=was_cached, ms=round(elapsed, 1),
    )
    return JSONResponse(_build_response(results, was_cached, elapsed, "cost_of_living", query))


# ─── Cache management endpoints ───────────────────────────────────────────────

@router.delete(
    "/cache",
    summary="Flush all search result caches",
    status_code=status.HTTP_200_OK,
)
async def flush_all_cache() -> dict[str, Any]:
    """
    Delete all search-related keys from Upstash Redis.

    Useful after a fresh scrape run to ensure the API returns
    updated results rather than stale cached data.
    """
    deleted = await _cache.flush_all_search_cache()
    log.info("cache_flushed_all", deleted=deleted)
    return {"deleted_keys": deleted, "message": "Search cache cleared."}


@router.delete(
    "/cache/{pattern}",
    summary="Flush search cache keys matching a pattern",
    status_code=status.HTTP_200_OK,
)
async def flush_cache_pattern(
    pattern: str,
) -> dict[str, Any]:
    """
    Delete cache keys matching a glob pattern.

    Examples:
        DELETE /api/search/cache/search:visa:*
        DELETE /api/search/cache/search:scholarship:united+kingdom:*
    """
    if not pattern.startswith("search:"):
        # Safety guard: only allow flushing search-namespaced keys
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pattern must start with \'search:\' to prevent accidental data loss.",
        )
    deleted = await _cache.flush_pattern(pattern)
    log.info("cache_flushed_pattern", pattern=pattern, deleted=deleted)
    return {"pattern": pattern, "deleted_keys": deleted}


# ─── Health check ─────────────────────────────────────────────────────────────

@router.get(
    "/health",
    summary="Search service health check",
    include_in_schema=False,
)
async def search_health() -> dict[str, str]:
    """Liveness probe — confirms the search router is reachable."""
    return {"status": "ok", "service": "globalpath-search"}
