"""
GlobalPath AI — Shortlist API Router
=====================================
FastAPI router with prefix /api/shortlist.

Endpoints:
    POST   /api/shortlist/add                    — save a university (max 15)
    DELETE /api/shortlist/remove/{university_id} — remove from shortlist
    GET    /api/shortlist/{user_id}              — full shortlist with eligibility
    POST   /api/shortlist/compare               — side-by-side comparison JSON
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db
from app.models.profile_models import (
    CompareRequest,
    CompareResponse,
    ShortlistAddRequest,
    ShortlistEntryResponse,
    ShortlistModel,
    ShortlistResponse,
    StudentProfileModel,
    UniversityCompareRow,
)
from app.services.eligibility_service import EligibilityService

log = structlog.get_logger(__name__)

router = APIRouter(tags=["shortlist"])

_eligibility_svc = EligibilityService()

MAX_SHORTLIST_SIZE = 15


# ─────────────────────────────────────────────────────────────────────────────
#  Helper: row → Pydantic response
# ─────────────────────────────────────────────────────────────────────────────

def _entry_to_response(row: ShortlistModel) -> ShortlistEntryResponse:
    return ShortlistEntryResponse(
        entry_id=row.entry_id,
        university_id=row.university_id,
        university_name=row.university_name,
        country=row.country,
        program_name=row.program_name,
        notes=row.notes,
        eligible=row.eligible,
        eligibility_gaps=row.eligibility_gaps or [],
        match_score=row.match_score,
        added_at=row.added_at.isoformat() if row.added_at else "",
    )


async def _require_profile(user_id: str, db: AsyncSession) -> StudentProfileModel:
    result = await db.execute(
        select(StudentProfileModel).where(StudentProfileModel.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No profile found for user_id={user_id!r}. Create a profile first.",
        )
    return profile


# ─────────────────────────────────────────────────────────────────────────────
#  POST /api/shortlist/add
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/add",
    status_code=status.HTTP_201_CREATED,
    summary="Add a university to the user's shortlist (max 15)",
)
async def add_to_shortlist(
    body: ShortlistAddRequest,
    db:   AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Save a university to the authenticated user's shortlist.

    Business rules:
      - Maximum 15 universities per user
      - Duplicate university_id for the same user is silently ignored
        (returns the existing entry rather than erroring)
      - Runs a quick eligibility check immediately so the GET endpoint
        can return eligibility badges without a separate request

    Returns:
        { entry_id, added, message, match_score, eligible }
    """
    user_id = body.user_id
    profile = await _require_profile(user_id, db)

    # Check current shortlist size
    count_result = await db.execute(
        select(ShortlistModel).where(ShortlistModel.user_id == user_id)
    )
    existing_entries = count_result.scalars().all()

    # Detect duplicate
    duplicate = next(
        (e for e in existing_entries if e.university_id == body.university_id),
        None,
    )
    if duplicate is not None:
        log.info("shortlist_add_duplicate", user_id=user_id, university_id=body.university_id)
        return {
            "entry_id": duplicate.entry_id,
            "added":    False,
            "message":  "University is already in your shortlist.",
            "match_score": duplicate.match_score,
            "eligible":    duplicate.eligible,
        }

    if len(existing_entries) >= MAX_SHORTLIST_SIZE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Shortlist is full ({MAX_SHORTLIST_SIZE} universities maximum). "
                "Remove a university before adding a new one."
            ),
        )

    # Build a minimal university dict for the eligibility check
    university_dict: dict[str, Any] = {
        "id":           body.university_id,
        "name":         body.university_name,
        "country":      body.country,
        "degree_level": profile.target_degree or "",
        # Other fields (ielts_min, gpa_min, etc.) not available here —
        # they'll be populated when a full eligibility check is requested.
    }
    eligibility = _eligibility_svc.check_university_eligibility(profile, university_dict)

    entry = ShortlistModel(
        entry_id=str(uuid.uuid4()),
        user_id=user_id,
        profile_id=profile.profile_id,
        university_id=body.university_id,
        university_name=body.university_name,
        country=body.country,
        program_name=body.program_name,
        notes=body.notes,
        eligible=eligibility.eligible,
        eligibility_gaps=eligibility.gaps,
        match_score=eligibility.match_score,
        checked_at=datetime.now(timezone.utc),
    )
    db.add(entry)

    try:
        await db.commit()
        await db.refresh(entry)
    except Exception as exc:
        await db.rollback()
        log.error("shortlist_add_db_error", user_id=user_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")

    log.info(
        "shortlist_entry_added",
        user_id=user_id,
        university_id=body.university_id,
        eligible=eligibility.eligible,
        match_score=eligibility.match_score,
    )
    return {
        "entry_id":    entry.entry_id,
        "added":       True,
        "message":     f"{body.university_name or body.university_id} added to shortlist.",
        "match_score": eligibility.match_score,
        "eligible":    eligibility.eligible,
        "gaps":        eligibility.gaps,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  DELETE /api/shortlist/remove/{university_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.delete(
    "/remove/{university_id}",
    summary="Remove a university from the shortlist",
)
async def remove_from_shortlist(
    university_id: str,
    user_id:       str = Query(..., description="The user's Supabase ID"),
    db:            AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Remove a university from the user's shortlist by university_id.

    Returns 404 if the university is not in the shortlist (not a silent no-op,
    so the frontend can detect stale state).
    """
    result = await db.execute(
        select(ShortlistModel).where(
            ShortlistModel.user_id      == user_id,
            ShortlistModel.university_id == university_id,
        )
    )
    entry = result.scalar_one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"University {university_id!r} not found in shortlist for user {user_id!r}.",
        )

    university_name = entry.university_name
    await db.execute(
        sql_delete(ShortlistModel).where(
            ShortlistModel.user_id      == user_id,
            ShortlistModel.university_id == university_id,
        )
    )
    await db.commit()

    log.info("shortlist_entry_removed", user_id=user_id, university_id=university_id)
    return {
        "removed":       True,
        "university_id": university_id,
        "message":       f"{university_name or university_id} removed from shortlist.",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  GET /api/shortlist/{user_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{user_id}",
    response_model=ShortlistResponse,
    summary="Get the user's full shortlist with cached eligibility scores",
)
async def get_shortlist(
    user_id: str,
    db:      AsyncSession = Depends(get_db),
) -> ShortlistResponse:
    """
    Return all shortlisted universities for a user, including the cached
    eligibility assessment from the last check.

    Eligibility data is updated:
      - When `add` is called (quick check with limited data)
      - When `POST /api/profile/{user_id}/eligibility-check` is called
        (full check with complete university requirement data)
    """
    result = await db.execute(
        select(ShortlistModel)
        .where(ShortlistModel.user_id == user_id)
        .order_by(ShortlistModel.added_at.asc())
    )
    rows = result.scalars().all()

    return ShortlistResponse(
        user_id=user_id,
        entries=[_entry_to_response(r) for r in rows],
        total=len(rows),
    )


# ─────────────────────────────────────────────────────────────────────────────
#  POST /api/shortlist/compare
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/compare",
    response_model=CompareResponse,
    summary="Side-by-side comparison of 2-3 shortlisted universities",
)
async def compare_universities(
    body: CompareRequest,
    db:   AsyncSession = Depends(get_db),
) -> CompareResponse:
    """
    Return a structured side-by-side comparison for 2 or 3 universities.

    The response `rows` array drives the comparison table in the React UI.
    Each row has a `field` label, `values` dict keyed by university_id,
    and an optional `winner` (university_id with the best value for that metric).

    Comparison dimensions:
      - University name
      - Country
      - Program name
      - Match score (from eligibility service)
      - Eligible (yes/no)
      - Eligibility gaps count
      - QS ranking (from cached university_data if available)
      - Tuition (from cached university_data)
      - IELTS requirement
      - Student notes
    """
    user_id = body.user_id
    ids     = body.university_ids

    result = await db.execute(
        select(ShortlistModel).where(
            ShortlistModel.user_id      == user_id,
            ShortlistModel.university_id.in_(ids),
        )
    )
    rows: list[ShortlistModel] = result.scalars().all()

    # Validate all requested universities are in the shortlist
    found_ids = {r.university_id for r in rows}
    missing   = [i for i in ids if i not in found_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"University IDs not found in shortlist: {missing}",
        )

    # Sort rows to match the order in body.university_ids
    row_map  = {r.university_id: r for r in rows}
    ordered  = [row_map[i] for i in ids]

    # ── Build comparison rows ─────────────────────────────────────────────────

    def _val(uid: str, key: str, default: Any = "—") -> Any:
        row  = row_map[uid]
        data = row.university_data or {}
        val  = data.get(key)
        return val if val is not None else default

    def _winner_by(key: str, prefer_lower: bool = False) -> str | None:
        """Return the university_id with the best value for a numeric field."""
        vals = {}
        for uid in ids:
            row  = row_map[uid]
            data = row.university_data or {}
            v    = data.get(key)
            if v is not None:
                vals[uid] = v
        if not vals or len(vals) < 2:
            return None
        return (min if prefer_lower else max)(vals, key=lambda k: vals[k])

    comparison_rows: list[UniversityCompareRow] = [
        UniversityCompareRow(
            field="University",
            values={uid: row_map[uid].university_name for uid in ids},
        ),
        UniversityCompareRow(
            field="Country",
            values={uid: row_map[uid].country for uid in ids},
        ),
        UniversityCompareRow(
            field="Program",
            values={uid: row_map[uid].program_name or "—" for uid in ids},
        ),
        UniversityCompareRow(
            field="Match Score",
            values={uid: f"{row_map[uid].match_score or 0}/100" for uid in ids},
            winner=max(ids, key=lambda uid: row_map[uid].match_score or 0),
        ),
        UniversityCompareRow(
            field="Eligible",
            values={
                uid: "✓ Yes" if row_map[uid].eligible else
                     ("✗ No" if row_map[uid].eligible is False else "Unknown")
                for uid in ids
            },
        ),
        UniversityCompareRow(
            field="Eligibility Gaps",
            values={uid: len(row_map[uid].eligibility_gaps or []) for uid in ids},
            winner=min(ids, key=lambda uid: len(row_map[uid].eligibility_gaps or [])),
        ),
        UniversityCompareRow(
            field="QS Ranking",
            values={uid: _val(uid, "qs_ranking") for uid in ids},
            winner=_winner_by("qs_ranking", prefer_lower=True),
        ),
        UniversityCompareRow(
            field="Tuition (USD/yr)",
            values={
                uid: (
                    f"${_val(uid, 'tuition_usd'):,.0f}"
                    if isinstance(_val(uid, "tuition_usd"), (int, float)) else "—"
                )
                for uid in ids
            },
            winner=_winner_by("tuition_usd", prefer_lower=True),
        ),
        UniversityCompareRow(
            field="IELTS Minimum",
            values={uid: _val(uid, "ielts_min") for uid in ids},
            winner=_winner_by("ielts_min", prefer_lower=True),
        ),
        UniversityCompareRow(
            field="Acceptance Rate",
            values={
                uid: (
                    f"{_val(uid, 'acceptance_rate') * 100:.0f}%"
                    if isinstance(_val(uid, "acceptance_rate"), float) else "—"
                )
                for uid in ids
            },
            winner=_winner_by("acceptance_rate"),  # higher acceptance = easier = "better" for this metric
        ),
        UniversityCompareRow(
            field="Cost of Living (USD/mo)",
            values={
                uid: (
                    f"${_val(uid, 'cost_of_living_usd_monthly'):,.0f}"
                    if isinstance(_val(uid, "cost_of_living_usd_monthly"), (int, float)) else "—"
                )
                for uid in ids
            },
            winner=_winner_by("cost_of_living_usd_monthly", prefer_lower=True),
        ),
        UniversityCompareRow(
            field="Your Notes",
            values={uid: row_map[uid].notes or "—" for uid in ids},
        ),
    ]

    # ── Generate a plain-English recommendation ───────────────────────────────
    scores = {uid: row_map[uid].match_score or 0 for uid in ids}
    best   = max(scores, key=lambda uid: scores[uid])
    best_name = row_map[best].university_name

    gapped = {uid: len(row_map[uid].eligibility_gaps or []) for uid in ids}
    fewest_gaps_uid  = min(gapped, key=lambda uid: gapped[uid])
    fewest_gaps_name = row_map[fewest_gaps_uid].university_name

    if best == fewest_gaps_uid:
        recommendation = (
            f"**{best_name}** scores highest for match ({scores[best]}/100) and has the "
            f"fewest eligibility gaps. It is your strongest overall option from this comparison."
        )
    else:
        recommendation = (
            f"**{best_name}** has the highest match score ({scores[best]}/100). "
            f"**{fewest_gaps_name}** has the fewest eligibility gaps ({gapped[fewest_gaps_uid]}). "
            f"Run a full eligibility check (POST /eligibility-check) for detailed gap analysis."
        )

    log.info("shortlist_compare", user_id=user_id, ids=ids)
    return CompareResponse(
        university_ids=ids,
        rows=comparison_rows,
        recommendation=recommendation,
    )
