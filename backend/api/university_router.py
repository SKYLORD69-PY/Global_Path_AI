"""
GlobalPath AI — University API Router
=======================================
All university-related REST endpoints.

Prefix: /api/universities   (registered in main.py)

Endpoints:
    GET  /search                       — filtered, ranked university list
    GET  /:id                          — full university detail
    POST /compare                      — side-by-side comparison
    GET  /:id/requirements?degree=     — entry requirements per degree level

All endpoints require a valid Supabase JWT (SupabaseUser dependency).
"""

from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.supabase_middleware import SupabaseUser
from app.models.database import get_db
from app.services.university_service import UniversityService

log    = APIRouter(tags=["universities"])
router = log          # alias so the import in main.py works without renaming
log    = structlog.get_logger(__name__)

# ─── Request / Response models ────────────────────────────────────────────────

class CompareRequest(BaseModel):
    ids: list[str] = Field(..., min_length=2, max_length=3,
                            description="2–3 university IDs to compare")


# ─── GET /search ──────────────────────────────────────────────────────────────

@router.get(
    "/search",
    summary="Search universities with filters",
)
async def search_universities(
    auth:       SupabaseUser,
    country:    str | None  = Query(None, description="Destination country"),
    field:      str | None  = Query(None, description="Field of study / program keyword"),
    degree:     str | None  = Query(None, description="bachelors | masters | phd"),
    budget_max: float | None = Query(None, ge=0, description="Maximum annual tuition in USD"),
    ielts_min:  float | None = Query(None, ge=0, le=9, description="Student's IELTS band score"),
    limit:      int          = Query(20, ge=1, le=50),
    offset:     int          = Query(0,  ge=0),
    db: AsyncSession         = Depends(get_db),
):
    svc    = UniversityService(db)
    result = await svc.search(
        country=country,
        field=field,
        degree=degree,
        budget_max=budget_max,
        ielts_min=ielts_min,
        limit=limit,
        offset=offset,
    )
    return result


# ─── GET /:id ─────────────────────────────────────────────────────────────────

@router.get(
    "/{university_id}",
    summary="Get full university profile",
)
async def get_university(
    university_id: str,
    auth: SupabaseUser,
    db: AsyncSession = Depends(get_db),
):
    svc = UniversityService(db)
    uni = await svc.get_details(university_id)
    if not uni:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"University '{university_id}' not found.",
        )
    return uni


# ─── POST /compare ────────────────────────────────────────────────────────────

@router.post(
    "/compare",
    summary="Side-by-side comparison of 2–3 universities",
)
async def compare_universities(
    body: CompareRequest,
    auth: SupabaseUser,
    db:   AsyncSession = Depends(get_db),
):
    svc    = UniversityService(db)
    result = await svc.compare(body.ids)

    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result["error"],
        )
    return result


# ─── GET /:id/requirements ────────────────────────────────────────────────────

@router.get(
    "/{university_id}/requirements",
    summary="Entry requirements for a given degree level",
)
async def get_requirements(
    university_id: str,
    auth:   SupabaseUser,
    degree: str          = Query("masters", description="bachelors | masters | phd"),
    db:     AsyncSession = Depends(get_db),
):
    if degree not in ("bachelors", "masters", "phd"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="degree must be one of: bachelors, masters, phd",
        )
    svc  = UniversityService(db)
    reqs = await svc.get_entry_requirements(university_id, degree)
    if not reqs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"University '{university_id}' not found.",
        )
    return reqs
