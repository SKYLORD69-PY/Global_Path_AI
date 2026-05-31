"""
GlobalPath AI — Student Profile API Router
===========================================
FastAPI router with prefix /api/profile.

Endpoints:
    POST   /api/profile/create              — create or upsert profile
    GET    /api/profile/{user_id}           — fetch profile + completeness score
    PATCH  /api/profile/{user_id}           — partial field update
    POST   /api/profile/{user_id}/eligibility-check — run full eligibility check

DB: async SQLAlchemy → PostgreSQL via Supabase
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.profile_models import (
    EligibilityCheckResponse,
    ShortlistModel,
    StudentProfileInput,
    StudentProfileModel,
    StudentProfileResponse,
    UniversityEligibilityResult,
    ScholarshipEligibilityResult,
)
from app.services.eligibility_service import EligibilityService

log = structlog.get_logger(__name__)

router = APIRouter(tags=["profile"])

_eligibility_svc = EligibilityService()

# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _model_from_input(
    user_id: str,
    data:    StudentProfileInput,
    existing: StudentProfileModel | None = None,
) -> StudentProfileModel:
    """
    Build or update a StudentProfileModel from a StudentProfileInput.
    Skips None fields on PATCH so existing values are preserved.
    """
    profile_id = existing.profile_id if existing else str(uuid.uuid4())

    if existing is None:
        m = StudentProfileModel(profile_id=profile_id, user_id=user_id)
    else:
        m = existing

    for field_name, value in data.model_dump(exclude_none=True).items():
        # Convert Pydantic sub-models to plain dicts for JSONB storage
        if hasattr(value, "model_dump"):
            value = value.model_dump()
        elif isinstance(value, list):
            value = [
                v.model_dump() if hasattr(v, "model_dump") else v
                for v in value
            ]
        if hasattr(m, field_name):
            setattr(m, field_name, value)

    m.completeness_score = m.compute_completeness()
    return m


async def _fetch_profile(
    user_id: str,
    db:      AsyncSession,
) -> StudentProfileModel:
    """Fetch profile by user_id or raise 404."""
    result  = await db.execute(
        select(StudentProfileModel).where(StudentProfileModel.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No profile found for user_id={user_id!r}",
        )
    return profile


# ─────────────────────────────────────────────────────────────────────────────
#  POST /api/profile/create
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create or update a student profile",
)
async def create_profile(
    user_id: str,
    body:    StudentProfileInput,
    db:      AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Upsert a student profile.

    - If a profile already exists for `user_id` it is updated in-place.
    - All fields are optional at creation; use PATCH for incremental updates.

    Returns:
        { profile_id, user_id, completeness_score, created, message }
    """
    # Check for existing profile
    result   = await db.execute(
        select(StudentProfileModel).where(StudentProfileModel.user_id == user_id)
    )
    existing = result.scalar_one_or_none()
    created  = existing is None

    profile = _model_from_input(user_id, body, existing)
    if created:
        db.add(profile)

    try:
        await db.commit()
        await db.refresh(profile)
    except Exception as exc:
        await db.rollback()
        log.error("profile_create_db_error", user_id=user_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    log.info(
        "profile_upserted",
        user_id=user_id,
        profile_id=profile.profile_id,
        completeness=profile.completeness_score,
        created=created,
    )
    return {
        "profile_id":        profile.profile_id,
        "user_id":           user_id,
        "completeness_score": profile.completeness_score,
        "created":           created,
        "message": (
            "Profile created successfully."
            if created else
            "Profile updated successfully."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  GET /api/profile/{user_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{user_id}",
    response_model=StudentProfileResponse,
    summary="Fetch a student profile",
)
async def get_profile(
    user_id: str,
    db:      AsyncSession = Depends(get_db),
) -> StudentProfileResponse:
    """
    Return the full profile for `user_id`, including a live completeness_score.

    Returns 404 if no profile exists yet (frontend should redirect to onboarding).
    """
    profile = await _fetch_profile(user_id, db)
    return profile.to_response()


# ─────────────────────────────────────────────────────────────────────────────
#  PATCH /api/profile/{user_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.patch(
    "/{user_id}",
    response_model=StudentProfileResponse,
    summary="Partially update a student profile",
)
async def patch_profile(
    user_id: str,
    body:    StudentProfileInput,
    db:      AsyncSession = Depends(get_db),
) -> StudentProfileResponse:
    """
    Update only the fields present in the request body.

    Omitted fields retain their existing values — this is the primary
    endpoint called during step-by-step onboarding as the user fills
    in each section.

    Returns the full updated profile.
    """
    profile = await _fetch_profile(user_id, db)
    profile = _model_from_input(user_id, body, existing=profile)
    profile.updated_at = datetime.now(timezone.utc)

    try:
        await db.commit()
        await db.refresh(profile)
    except Exception as exc:
        await db.rollback()
        log.error("profile_patch_db_error", user_id=user_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    log.info(
        "profile_patched",
        user_id=user_id,
        completeness=profile.completeness_score,
        fields_updated=list(body.model_dump(exclude_none=True).keys()),
    )
    return profile.to_response()


# ─────────────────────────────────────────────────────────────────────────────
#  POST /api/profile/{user_id}/eligibility-check
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{user_id}/eligibility-check",
    response_model=EligibilityCheckResponse,
    summary="Run eligibility checks against universities and scholarships",
)
async def eligibility_check(
    user_id:  str,
    body:     dict[str, Any],
    db:       AsyncSession = Depends(get_db),
) -> EligibilityCheckResponse:
    """
    Check the student's eligibility for:
      - Each university in `universities` list
      - Each scholarship in `scholarships` list

    Request body:
    ```json
    {
        "universities": [
            {
                "id": "uni_001",
                "name": "University of Edinburgh",
                "country": "United Kingdom",
                "ielts_min": 6.5,
                "gpa_min": 3.0,
                "degree_level": "masters",
                "is_mba": false,
                "tuition_usd": 32000
            }
        ],
        "scholarships": [
            {
                "id": "sch_001",
                "name": "Chevening",
                "eligible_nationalities": ["All"],
                "degree_levels": ["masters"],
                "gpa_min": null,
                "deadline": "2025-11-05"
            }
        ]
    }
    ```

    Returns eligibility result for every entry — frontend renders
    green/amber/red badges on the shortlist and scholarship panels.
    """
    profile      = await _fetch_profile(user_id, db)
    universities = body.get("universities", [])
    scholarships = body.get("scholarships", [])

    if not universities and not scholarships:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one university or scholarship to check.",
        )

    result = _eligibility_svc.run_full_eligibility_check(profile, universities, scholarships)

    # Cache eligibility results back into the shortlist rows for fast GET
    if universities:
        uni_map = {u.university_id: u for u in result.universities}
        shortlist_result = await db.execute(
            select(ShortlistModel).where(ShortlistModel.user_id == user_id)
        )
        shortlist_rows = shortlist_result.scalars().all()
        for row in shortlist_rows:
            if row.university_id in uni_map:
                r = uni_map[row.university_id]
                row.eligible         = r.eligible
                row.eligibility_gaps = r.gaps
                row.match_score      = r.match_score
                row.checked_at       = datetime.now(timezone.utc)
        try:
            await db.commit()
        except Exception:
            await db.rollback()

    log.info(
        "eligibility_check_complete",
        user_id=user_id,
        universities=len(result.universities),
        scholarships=len(result.scholarships),
    )
    return result
