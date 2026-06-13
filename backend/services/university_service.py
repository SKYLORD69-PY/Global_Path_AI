"""
GlobalPath AI — University Service
====================================
Business-logic layer for university search, detail retrieval, and comparison.

Ranking algorithm (search):
    Base score = 100
    +40  if QS rank ≤ 50
    +30  if QS rank ≤ 100
    +20  if QS rank ≤ 200
    +20  if field term found in programs list
    -25  if tuition exceeds budget by more than 20%
    -15  if IELTS minimum exceeds student's score
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy import (
    Boolean, Column, Float, Integer, String, Text, func, or_, select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase

log = structlog.get_logger(__name__)


# ─── ORM model ────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class UniversityORM(Base):
    __tablename__ = "universities"

    id                          = Column(String(64),  primary_key=True,
                                         default=lambda: str(uuid.uuid4()))
    name                        = Column(String(512), nullable=False, index=True)
    country                     = Column(String(100), nullable=False, index=True)
    city                        = Column(String(100), nullable=True)
    qs_rank                     = Column(Integer,     nullable=True, index=True)
    the_rank                    = Column(Integer,     nullable=True)
    tuition_usd                 = Column(Float,       nullable=True)
    tuition_local               = Column(String(100), nullable=True)
    tuition_currency            = Column(String(10),  nullable=True, default="USD")
    programs                    = Column(JSONB,       nullable=False, default=list)
    ielts_min                   = Column(Float,       nullable=True)
    toefl_min                   = Column(Integer,     nullable=True)
    gpa_min                     = Column(Float,       nullable=True)
    application_deadline        = Column(String(100), nullable=True)
    website                     = Column(Text,        nullable=True)
    accepts_gre                 = Column(Boolean,     nullable=False, default=False)
    work_experience_required    = Column(Boolean,     nullable=False, default=False)
    acceptance_rate             = Column(Float,       nullable=True)
    description                 = Column(Text,        nullable=True)
    scholarship_info            = Column(Text,        nullable=True)
    campus_size                 = Column(String(50),  nullable=True)
    student_count               = Column(Integer,     nullable=True)
    international_pct           = Column(Float,       nullable=True)
    cost_of_living_usd_monthly  = Column(Integer,     nullable=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id":                         self.id,
            "name":                       self.name,
            "country":                    self.country,
            "city":                       self.city,
            "qs_ranking":                 self.qs_rank,
            "the_ranking":                self.the_rank,
            "tuition_usd":                self.tuition_usd,
            "tuition_local":              self.tuition_local,
            "tuition_currency":           self.tuition_currency,
            "programs":                   self.programs or [],
            "ielts_min":                  self.ielts_min,
            "toefl_min":                  self.toefl_min,
            "gpa_min":                    self.gpa_min,
            "application_deadline":       self.application_deadline,
            "website":                    self.website,
            "accepts_gre":                self.accepts_gre,
            "work_experience_required":   self.work_experience_required,
            "acceptance_rate":            self.acceptance_rate,
            "description":                self.description,
            "scholarship_info":           self.scholarship_info,
            "campus_size":                self.campus_size,
            "student_count":              self.student_count,
            "international_pct":          self.international_pct,
            "cost_of_living_usd_monthly": self.cost_of_living_usd_monthly,
        }


# ─── Relevance scoring ────────────────────────────────────────────────────────

def _score(uni: UniversityORM, filters: dict) -> int:
    score = 100
    rank  = uni.qs_rank or 999
    if rank <= 50:    score += 40
    elif rank <= 100: score += 30
    elif rank <= 200: score += 20
    elif rank <= 500: score += 10

    budget_max = filters.get("budget_max")
    if budget_max and uni.tuition_usd and uni.tuition_usd > budget_max:
        score -= 25

    ielts_min = filters.get("ielts_min")
    if ielts_min and uni.ielts_min and uni.ielts_min > float(ielts_min):
        score -= 15

    field = (filters.get("field") or "").lower()
    if field and uni.programs:
        if any(field in p.lower() for p in uni.programs):
            score += 20

    return max(0, score)


# ─── Service ──────────────────────────────────────────────────────────────────

class UniversityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Search ────────────────────────────────────────────────────────────────

    async def search(
        self,
        country:    str | None   = None,
        field:      str | None   = None,
        degree:     str | None   = None,
        budget_max: float | None = None,
        ielts_min:  float | None = None,
        limit:      int  = 20,
        offset:     int  = 0,
    ) -> dict[str, Any]:
        query    = select(UniversityORM)
        filters: dict = {}

        if country and country.strip():
            query = query.where(
                func.lower(UniversityORM.country).contains(country.strip().lower())
            )
            filters["country"] = country

        if budget_max and budget_max > 0:
            query = query.where(
                or_(
                    UniversityORM.tuition_usd.is_(None),
                    UniversityORM.tuition_usd <= budget_max * 1.25,
                )
            )
            filters["budget_max"] = budget_max

        if ielts_min and ielts_min > 0:
            query = query.where(
                or_(
                    UniversityORM.ielts_min.is_(None),
                    UniversityORM.ielts_min <= float(ielts_min),
                )
            )
            filters["ielts_min"] = ielts_min

        if field and field.strip():
            term = field.strip().lower()
            query = query.where(
                func.lower(func.cast(UniversityORM.programs, Text)).contains(term)
            )
            filters["field"] = field

        result   = await self.db.execute(query)
        all_unis = result.scalars().all()

        scored = sorted(
            all_unis,
            key=lambda u: (-_score(u, filters), u.qs_rank or 9999),
        )

        total   = len(scored)
        paged   = scored[offset: offset + limit]

        log.info("university_search", filters=filters, total=total)
        return {
            "results": [u.to_dict() for u in paged],
            "total":   total,
            "offset":  offset,
            "limit":   limit,
        }

    # ── Details ───────────────────────────────────────────────────────────────

    async def get_details(self, university_id: str) -> dict[str, Any] | None:
        result = await self.db.execute(
            select(UniversityORM).where(UniversityORM.id == university_id)
        )
        uni = result.scalar_one_or_none()
        return uni.to_dict() if uni else None

    # ── Compare ───────────────────────────────────────────────────────────────

    async def compare(self, university_ids: list[str]) -> dict[str, Any]:
        ids = list(dict.fromkeys(university_ids))[:3]
        if len(ids) < 2:
            return {"error": "Provide 2–3 university IDs."}

        result = await self.db.execute(
            select(UniversityORM).where(UniversityORM.id.in_(ids))
        )
        unis_map = {u.id: u for u in result.scalars().all()}
        ordered  = [unis_map[i] for i in ids if i in unis_map]

        if len(ordered) < 2:
            return {"error": "One or more universities not found."}

        def make_row(label: str, attr: str, fmt=None, lower_is_better: bool = True):
            values = {}
            for u in ordered:
                raw = getattr(u, attr, None)
                values[u.id] = fmt(raw) if (fmt and raw is not None) else raw

            numerics = {
                u.id: getattr(u, attr)
                for u in ordered
                if isinstance(getattr(u, attr, None), (int, float))
            }
            winner = None
            if numerics:
                winner = (min if lower_is_better else max)(
                    numerics, key=lambda k: numerics[k]
                )
            return {"field": label, "key": attr, "values": values, "winner": winner,
                    "lower_is_better": lower_is_better}

        usd  = lambda v: f"${v:,.0f}/yr"
        rank = lambda v: f"#{v}"
        pct  = lambda v: f"{v * 100:.0f}%"

        rows = [
            make_row("QS Ranking",          "qs_rank",                   fmt=rank, lower_is_better=True),
            make_row("THE Ranking",         "the_rank",                  fmt=rank, lower_is_better=True),
            make_row("Country",             "country",                   lower_is_better=False),
            make_row("City",                "city",                      lower_is_better=False),
            make_row("Tuition / Year",      "tuition_usd",               fmt=usd,  lower_is_better=True),
            make_row("IELTS Minimum",       "ielts_min",                 lower_is_better=True),
            make_row("TOEFL Minimum",       "toefl_min",                 lower_is_better=True),
            make_row("Min GPA (4.0)",       "gpa_min",                   lower_is_better=True),
            make_row("Acceptance Rate",     "acceptance_rate",           fmt=pct,  lower_is_better=False),
            make_row("GRE Accepted",        "accepts_gre",               lower_is_better=False),
            make_row("Application Deadline","application_deadline",      lower_is_better=False),
            make_row("Living Cost/Month",   "cost_of_living_usd_monthly",fmt=usd,  lower_is_better=True),
            make_row("International %",     "international_pct",         fmt=pct,  lower_is_better=False),
        ]

        return {
            "universities": [u.to_dict() for u in ordered],
            "rows": rows,
        }

    # ── Entry requirements ────────────────────────────────────────────────────

    async def get_entry_requirements(
        self,
        university_id: str,
        degree_level:  str = "masters",
    ) -> dict[str, Any] | None:
        result = await self.db.execute(
            select(UniversityORM).where(UniversityORM.id == university_id)
        )
        uni = result.scalar_one_or_none()
        if not uni:
            return None

        gpa_adj, ielts_adj = 0.0, 0.0
        if degree_level == "phd":
            gpa_adj, ielts_adj = 0.2, 0.5
        elif degree_level == "bachelors":
            gpa_adj, ielts_adj = -0.3, -0.5

        return {
            "university_id":      university_id,
            "university_name":    uni.name,
            "degree_level":       degree_level,
            "gpa_min":            round(min(4.0, (uni.gpa_min or 3.0) + gpa_adj), 1),
            "ielts_min":          round(min(9.0, (uni.ielts_min or 6.5) + ielts_adj), 1),
            "toefl_min":          uni.toefl_min,
            "gre_required":       uni.accepts_gre and degree_level in ("masters", "phd"),
            "work_exp_required":  uni.work_experience_required,
            "application_deadline": uni.application_deadline,
            "prerequisites":      (uni.programs or [])[:3],
            "website":            uni.website,
        }
