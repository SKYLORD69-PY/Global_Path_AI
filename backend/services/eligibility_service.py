"""
GlobalPath AI — Eligibility Service
=====================================
Business-logic engine that evaluates whether a student's profile meets
the entry requirements for a university program or scholarship.

Three public methods:
    check_university_eligibility(profile, university)
        → {eligible: bool, gaps: list[str], score: int, recommendations: list[str]}

    check_scholarship_eligibility(profile, scholarship)
        → {eligible: bool, reason: str, missing_criteria: list[str]}

    get_missing_prerequisites(profile, target_degree)
        → list[{gap: str, severity: str, action: str, estimated_months: int}]

Design principles:
  - Never hard-fail on missing data — always degrade gracefully
  - Gaps are phrased as actionable advice, not just error messages
  - Score (0–100) is a weighted sum, not a pass/fail threshold alone
  - All checks cite which requirement failed so the student knows exactly what to fix
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# ─── Requirement thresholds ───────────────────────────────────────────────────

# IELTS minimums by destination + program type
_IELTS_MINIMUMS = {
    "United Kingdom":  {"bachelors": 6.0, "masters": 6.5, "phd": 6.5},
    "United States":   {"bachelors": 6.0, "masters": 6.5, "phd": 6.5},
    "Canada":          {"bachelors": 6.0, "masters": 6.5, "phd": 6.5},
    "Australia":       {"bachelors": 6.0, "masters": 6.5, "phd": 6.5},
    "Germany":         {"bachelors": 6.0, "masters": 6.0, "phd": 6.0},
    "Netherlands":     {"bachelors": 6.0, "masters": 6.5, "phd": 6.5},
    "Ireland":         {"bachelors": 6.0, "masters": 6.0, "phd": 6.0},
    "_default":        {"bachelors": 6.0, "masters": 6.0, "phd": 6.0},
}

# TOEFL minimums (iBT)
_TOEFL_MINIMUMS = {
    "United Kingdom":  {"bachelors": 80,  "masters": 90,  "phd": 90},
    "United States":   {"bachelors": 80,  "masters": 90,  "phd": 90},
    "Canada":          {"bachelors": 80,  "masters": 90,  "phd": 90},
    "Australia":       {"bachelors": 79,  "masters": 90,  "phd": 90},
    "_default":        {"bachelors": 79,  "masters": 85,  "phd": 85},
}

# GPA thresholds by institution tier (QS ranking bucket)
_GPA_BY_TIER = {
    "top_10":   3.7,   # QS 1–10
    "top_50":   3.5,   # QS 11–50
    "top_100":  3.3,   # QS 51–100
    "top_200":  3.0,   # QS 101–200
    "top_500":  2.7,   # QS 201–500
    "unranked": 2.5,
}

# Work-experience requirements
_WORK_EXP_REQUIREMENTS = {
    "mba":     {"min_years": 2, "preferred_years": 3},
    "masters":  {"min_years": 0, "preferred_years": 0},
    "phd":      {"min_years": 0, "preferred_years": 0},
}


def _qs_to_tier(ranking: int | None) -> str:
    """Map a QS ranking number to a tier string."""
    if ranking is None:
        return "unranked"
    if ranking <= 10:   return "top_10"
    if ranking <= 50:   return "top_50"
    if ranking <= 100:  return "top_100"
    if ranking <= 200:  return "top_200"
    if ranking <= 500:  return "top_500"
    return "unranked"


# ═════════════════════════════════════════════════════════════════════════════
#  EligibilityService
# ═════════════════════════════════════════════════════════════════════════════

class EligibilityService:
    """
    Evaluates eligibility and computes match scores for universities and
    scholarships against a student's profile.

    All methods accept plain dicts (from the DB / API layer) rather than
    ORM objects so the service has no database dependency and is trivially
    testable.
    """

    def __init__(self) -> None:
        self.log = structlog.get_logger(component="EligibilityService")

    # ═════════════════════════════════════════════════════════════════════════
    #  University eligibility
    # ═════════════════════════════════════════════════════════════════════════

    def check_university_eligibility(
        self,
        profile:    dict[str, Any],
        university: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Evaluate whether the student meets a university program's entry requirements.

        Checks (in order):
          1. Degree-level prerequisite (must have the right prior degree)
          2. GPA / academic performance
          3. IELTS / TOEFL English proficiency
          4. GMAT/GRE (for MBA and some master's programs)
          5. Work experience (MBA)
          6. Field prerequisite (e.g. CS master's requires STEM undergrad)
          7. Application deadline

        Args:
            profile:    StudentProfile as a dict (from ORM.to_pydantic().model_dump())
            university: University record dict with keys:
                        name, country, qs_ranking, program_name,
                        ielts_min, toefl_min, gpa_min (on 4.0 scale),
                        gre_required, work_exp_required, degree_required,
                        field_prerequisites (list), application_deadline

        Returns:
            {
                eligible:         bool,
                score:            int (0-100, weighted match quality),
                gaps:             list[str] (human-readable gaps),
                recommendations:  list[str] (how to close each gap),
                hard_blocks:      list[str] (non-negotiable blockers),
                soft_warnings:    list[str] (things to be aware of but not blockers),
            }
        """
        gaps:            list[str] = []
        recommendations: list[str] = []
        hard_blocks:     list[str] = []
        soft_warnings:   list[str] = []
        score_penalties: list[int] = []

        uni_name    = university.get("name", "the university")
        country     = university.get("country", "")
        degree_type = (university.get("degree_type") or
                       university.get("program_name", "")).lower()
        is_mba      = "mba" in degree_type

        # ── 1. Degree prerequisite ────────────────────────────────────────────
        required_prior = university.get("degree_required", "")
        current_level  = profile.get("current_education_level", "")

        _level_order = {"high_school": 0, "bachelors": 1, "masters": 2}
        _required_map = {"bachelors": "high_school", "masters": "bachelors", "phd": "masters"}

        target_degree = university.get("target_degree") or profile.get("target_degree", "")
        required_prior_for_target = _required_map.get(str(target_degree).lower(), "")

        if required_prior_for_target:
            current_rank  = _level_order.get(str(current_level).lower(), -1)
            required_rank = _level_order.get(required_prior_for_target, 0)
            if current_rank < required_rank:
                msg = (
                    f"Requires a {required_prior_for_target.replace('_', ' ')} degree "
                    f"before applying to this {target_degree} program"
                )
                hard_blocks.append(msg)
                gaps.append(msg)
                recommendations.append(
                    f"Complete your {required_prior_for_target.replace('_', ' ')} "
                    f"degree first — this is a prerequisite."
                )

        # ── 2. GPA check ──────────────────────────────────────────────────────
        gpa_4scale = self._gpa_to_4scale(
            profile.get("gpa"), profile.get("gpa_scale")
        )
        gpa_min = university.get("gpa_min")

        if gpa_min is None:
            # Infer from tier
            tier = _qs_to_tier(university.get("qs_ranking"))
            gpa_min = _GPA_BY_TIER.get(tier, 2.5)

        if gpa_4scale is not None:
            deficit = gpa_min - gpa_4scale
            if deficit > 0.5:
                msg = (
                    f"GPA gap: you have {gpa_4scale:.2f}/4.0, "
                    f"{uni_name} typically requires {gpa_min:.1f}/4.0"
                )
                hard_blocks.append(msg)
                gaps.append(msg)
                recommendations.append(
                    "Consider universities in a lower tier while working on "
                    "postgraduate certificates to boost your academic record."
                )
                score_penalties.append(20)
            elif deficit > 0:
                msg = (
                    f"GPA slightly below typical threshold: "
                    f"you have {gpa_4scale:.2f}/4.0 vs ~{gpa_min:.1f}/4.0 expected"
                )
                soft_warnings.append(msg)
                gaps.append(msg)
                recommendations.append(
                    "Your GPA is close to the threshold — a strong SOP and "
                    "relevant work experience can compensate."
                )
                score_penalties.append(8)
        elif gpa_4scale is None:
            soft_warnings.append("GPA not provided — include it for a complete eligibility check")
            score_penalties.append(5)

        # ── 3. English proficiency ────────────────────────────────────────────
        lang_gaps = self._check_english_requirement(
            profile, country, str(target_degree).lower(), university
        )
        for gap in lang_gaps["hard"]:
            hard_blocks.append(gap)
            gaps.append(gap)
        for gap in lang_gaps["soft"]:
            soft_warnings.append(gap)
        recommendations.extend(lang_gaps["recommendations"])
        score_penalties.extend(lang_gaps["penalties"])

        # ── 4. GMAT / GRE ────────────────────────────────────────────────────
        if university.get("gre_required") or is_mba:
            gmat_gre = profile.get("gmat_gre") or {}
            test_name  = gmat_gre.get("test")
            test_score = gmat_gre.get("score")
            required_score = university.get("gmat_min") or university.get("gre_min")

            if not test_name:
                test_label = "GMAT" if is_mba else "GRE"
                msg = f"{test_label} score required but not on your profile"
                if is_mba:
                    hard_blocks.append(msg)
                gaps.append(msg)
                recommendations.append(
                    f"Register for the {test_label} — allows 5-year score validity. "
                    f"Preparation typically takes 2–3 months."
                )
                score_penalties.append(15 if is_mba else 10)
            elif required_score and test_score and test_score < required_score:
                msg = (
                    f"{test_name} score {test_score} is below the ~{required_score} "
                    f"threshold for {uni_name}"
                )
                soft_warnings.append(msg)
                gaps.append(msg)
                recommendations.append(
                    f"Aim for {required_score}+ on the {test_name}. "
                    "Free prep resources: Khan Academy (GRE), GMAT Club (GMAT)."
                )
                score_penalties.append(10)

        # ── 5. Work experience (MBA) ──────────────────────────────────────────
        if is_mba:
            work_yrs = profile.get("work_experience_years") or 0
            min_exp  = university.get("work_exp_required") or _WORK_EXP_REQUIREMENTS["mba"]["min_years"]

            if work_yrs < min_exp:
                msg = (
                    f"MBA programs at {uni_name} typically require {min_exp}+ "
                    f"years of work experience (you have {work_yrs:.0f})"
                )
                if min_exp >= 2:
                    hard_blocks.append(msg)
                    score_penalties.append(20)
                else:
                    soft_warnings.append(msg)
                    score_penalties.append(8)
                gaps.append(msg)
                recommendations.append(
                    f"Gain {max(0, min_exp - work_yrs):.0f} more years of professional "
                    f"experience before applying. Consider deferred entry programmes."
                )

        # ── 6. Field prerequisite ─────────────────────────────────────────────
        field_prereqs = university.get("field_prerequisites") or []
        student_field = (profile.get("field_of_study") or "").lower()

        if field_prereqs and student_field:
            prereq_lower = [f.lower() for f in field_prereqs]
            field_match  = any(
                prereq in student_field or student_field in prereq
                for prereq in prereq_lower
            )
            if not field_match:
                msg = (
                    f"This program prefers applicants from: "
                    f"{', '.join(field_prereqs)}. Your background is {student_field}."
                )
                soft_warnings.append(msg)
                gaps.append(msg)
                recommendations.append(
                    "Bridge programs or foundation courses can help demonstrate "
                    "subject competency if you're switching fields."
                )
                score_penalties.append(10)

        # ── 7. Application deadline ───────────────────────────────────────────
        deadline_str = university.get("application_deadline")
        if deadline_str:
            try:
                deadline = date.fromisoformat(str(deadline_str))
                today    = date.today()
                days_remaining = (deadline - today).days
                if days_remaining < 0:
                    msg = f"Application deadline passed ({deadline_str})"
                    hard_blocks.append(msg)
                    gaps.append(msg)
                    recommendations.append(
                        "This intake has closed. Check if the university accepts "
                        "rolling admissions or apply for the next intake."
                    )
                    score_penalties.append(25)
                elif days_remaining < 30:
                    soft_warnings.append(
                        f"Application deadline approaching: {days_remaining} days left ({deadline_str})"
                    )
            except (ValueError, TypeError):
                pass

        # ── Compute score ────────────────────────────────────────────────────
        total_penalty = sum(score_penalties)
        score = max(0, 100 - total_penalty)

        # Hard blocks cap the score at 30
        if hard_blocks:
            score = min(score, 30)

        eligible = len(hard_blocks) == 0

        self.log.debug(
            "university_eligibility",
            university=uni_name,
            eligible=eligible,
            score=score,
            hard_blocks=len(hard_blocks),
            gaps=len(gaps),
        )

        return {
            "eligible":        eligible,
            "score":           score,
            "gaps":            gaps,
            "recommendations": recommendations,
            "hard_blocks":     hard_blocks,
            "soft_warnings":   soft_warnings,
        }

    def _check_english_requirement(
        self,
        profile:  dict,
        country:  str,
        degree:   str,
        university: dict,
    ) -> dict:
        """Check English language requirements. Returns {hard, soft, recommendations, penalties}."""
        hard:            list[str] = []
        soft:            list[str] = []
        recommendations: list[str] = []
        penalties:       list[int] = []

        # Student's test scores
        ielts_score = None
        toefl_score = None
        for test in (profile.get("language_tests") or []):
            name = (test.get("test_name") or "").upper()
            raw  = test.get("score")
            try:
                val = float(str(raw).replace(",", "."))
            except (ValueError, TypeError):
                continue
            if name == "IELTS":
                ielts_score = val
            elif name == "TOEFL":
                toefl_score = int(val)

        # Required scores (from university record, or from country/degree defaults)
        ielts_req = university.get("ielts_min") or (
            _IELTS_MINIMUMS.get(country, _IELTS_MINIMUMS["_default"]).get(degree, 6.0)
        )
        toefl_req = university.get("toefl_min") or (
            _TOEFL_MINIMUMS.get(country, _TOEFL_MINIMUMS["_default"]).get(degree, 80)
        )

        if ielts_score is None and toefl_score is None:
            msg = (
                f"No English proficiency test on record. "
                f"Minimum required: IELTS {ielts_req} or TOEFL {toefl_req}"
            )
            hard.append(msg)
            recommendations.append(
                f"Book an IELTS test (most widely accepted) — "
                f"aim for {ielts_req}+. Preparation typically takes 6–12 weeks."
            )
            penalties.append(20)
            return {"hard": hard, "soft": soft, "recommendations": recommendations, "penalties": penalties}

        # IELTS check
        if ielts_score is not None:
            deficit = ielts_req - ielts_score
            if deficit > 0.5:
                msg = f"IELTS {ielts_score} is below the {ielts_req} requirement"
                hard.append(msg)
                recommendations.append(
                    f"Retake IELTS targeting {ielts_req}+. "
                    "Free practice: British Council IELTS Ready Premium."
                )
                penalties.append(18)
            elif deficit > 0:
                msg = f"IELTS {ielts_score} is slightly below the {ielts_req} requirement"
                soft.append(msg)
                recommendations.append(
                    f"Your IELTS is close — one more practice attempt "
                    f"could push you to {ielts_req}."
                )
                penalties.append(8)

        # TOEFL check
        elif toefl_score is not None:
            deficit = toefl_req - toefl_score
            if deficit > 5:
                msg = f"TOEFL {toefl_score} is below the {toefl_req} requirement"
                hard.append(msg)
                recommendations.append(f"Retake TOEFL targeting {toefl_req}+.")
                penalties.append(18)
            elif deficit > 0:
                soft.append(f"TOEFL {toefl_score} is slightly below {toefl_req}")
                penalties.append(8)

        return {"hard": hard, "soft": soft, "recommendations": recommendations, "penalties": penalties}

    # ═════════════════════════════════════════════════════════════════════════
    #  Scholarship eligibility
    # ═════════════════════════════════════════════════════════════════════════

    def check_scholarship_eligibility(
        self,
        profile:     dict[str, Any],
        scholarship: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Evaluate whether a student is eligible for a scholarship.

        Checks:
          1. Nationality restrictions
          2. Degree level match
          3. Field of study restrictions
          4. GPA minimum
          5. Deadline status
          6. English test requirement

        Args:
            profile:     Student profile as dict.
            scholarship: Scholarship record dict with keys:
                         name, eligible_nationalities (list), degree_levels (list),
                         field_restrictions, gpa_min, deadline, url

        Returns:
            {
                eligible:          bool,
                reason:            str (plain English summary),
                missing_criteria:  list[str],
                match_score:       int (0–100),
            }
        """
        missing:     list[str] = []
        passed:      list[str] = []
        score        = 100

        scholarship_name = scholarship.get("name", "this scholarship")

        # ── 1. Nationality check ──────────────────────────────────────────────
        eligible_nats = scholarship.get("eligible_nationalities") or []
        student_nat   = (profile.get("nationality") or "").strip().lower()

        if eligible_nats:
            nat_lower = [n.lower() for n in eligible_nats]
            # "all" or "all nationalities" means open to everyone
            is_open = any("all" in n for n in nat_lower)
            if not is_open and student_nat:
                # Check for exact match or common nationality variants
                matched = any(
                    student_nat in n or n in student_nat
                    for n in nat_lower
                )
                if not matched:
                    missing.append(
                        f"Nationality restriction: {scholarship_name} is open to "
                        f"{', '.join(eligible_nats[:3])}{'...' if len(eligible_nats) > 3 else ''} "
                        f"— not available for {profile.get('nationality', 'your nationality')}"
                    )
                    score -= 50  # Hard block
                else:
                    passed.append("Nationality: eligible ✓")
            elif is_open:
                passed.append("Nationality: open to all ✓")

        # ── 2. Degree level ───────────────────────────────────────────────────
        degree_levels = scholarship.get("degree_levels") or []
        student_degree = (profile.get("target_degree") or "").lower()

        if degree_levels:
            level_lower = [d.lower() for d in degree_levels]
            if student_degree and student_degree not in level_lower and "all" not in level_lower:
                missing.append(
                    f"Degree level mismatch: {scholarship_name} is for "
                    f"{', '.join(degree_levels)} — you are targeting {student_degree}"
                )
                score -= 40
            else:
                passed.append(f"Degree level: {student_degree} ✓")

        # ── 3. Field of study ────────────────────────────────────────────────
        field_restriction = (scholarship.get("field_restrictions") or "").lower()
        student_field     = (profile.get("field_of_study") or "").lower()

        if field_restriction and "any" not in field_restriction and "all" not in field_restriction:
            if student_field and student_field not in field_restriction and field_restriction not in student_field:
                missing.append(
                    f"Field restriction: {scholarship_name} is for {scholarship.get('field_restrictions')} — "
                    f"your field ({profile.get('field_of_study', 'not specified')}) may not qualify"
                )
                score -= 20
            else:
                passed.append("Field of study: eligible ✓")

        # ── 4. GPA minimum ────────────────────────────────────────────────────
        gpa_min = scholarship.get("gpa_min")
        if gpa_min:
            gpa_4scale = self._gpa_to_4scale(
                profile.get("gpa"), profile.get("gpa_scale")
            )
            if gpa_4scale is not None:
                if gpa_4scale < float(gpa_min):
                    missing.append(
                        f"GPA below minimum: {scholarship_name} requires "
                        f"{gpa_min}/4.0 GPA — you have {gpa_4scale:.2f}/4.0"
                    )
                    score -= 25
                else:
                    passed.append(f"GPA: {gpa_4scale:.2f}/4.0 meets {gpa_min} minimum ✓")
            else:
                missing.append("GPA not provided — required for complete eligibility check")
                score -= 5

        # ── 5. Deadline ───────────────────────────────────────────────────────
        deadline = scholarship.get("deadline")
        if deadline:
            try:
                deadline_date = date.fromisoformat(str(deadline))
                today         = date.today()
                days_left     = (deadline_date - today).days
                if days_left < 0:
                    missing.append(
                        f"Deadline passed: {scholarship_name} deadline was {deadline}"
                    )
                    score -= 60  # Effectively ineligible but not impossible (rolling intakes)
                elif days_left < 30:
                    passed.append(f"⚠️ Deadline in {days_left} days ({deadline}) — apply urgently")
                else:
                    passed.append(f"Deadline: {days_left} days remaining ✓")
            except (ValueError, TypeError):
                pass

        # ── Build reason string ───────────────────────────────────────────────
        score = max(0, score)
        eligible = (score >= 50) and not any(
            "nationality restriction" in m.lower() or "deadline passed" in m.lower()
            for m in missing
        )

        if not missing:
            reason = f"You meet all known eligibility criteria for {scholarship_name}."
        elif eligible:
            reason = (
                f"You may be eligible for {scholarship_name}, but have "
                f"{len(missing)} potential gap(s) to address."
            )
        else:
            reason = (
                f"You do not appear to be eligible for {scholarship_name} "
                f"due to: {missing[0]}"
            )

        self.log.debug(
            "scholarship_eligibility",
            scholarship=scholarship_name,
            eligible=eligible,
            score=score,
            missing=len(missing),
        )

        return {
            "eligible":         eligible,
            "reason":           reason,
            "missing_criteria": missing,
            "passed_criteria":  passed,
            "match_score":      score,
        }

    # ═════════════════════════════════════════════════════════════════════════
    #  Missing prerequisites
    # ═════════════════════════════════════════════════════════════════════════

    def get_missing_prerequisites(
        self,
        profile:       dict[str, Any],
        target_degree: str,
    ) -> list[dict[str, Any]]:
        """
        Return a structured list of gaps between the student's current
        profile and what they need to be a competitive applicant.

        Each gap includes severity, the suggested action, and estimated time.

        Args:
            profile:       Student profile dict.
            target_degree: "bachelors" | "masters" | "phd"

        Returns:
            List of gap dicts sorted by severity (critical first):
            [{
                gap:               str,   # what's missing
                severity:          str,   # "critical" | "important" | "recommended"
                action:            str,   # what to do about it
                estimated_months:  int,   # how long to close the gap
                category:          str,   # "academic" | "language" | "test" | "document" | "experience"
            }]
        """
        prerequisites: list[dict] = []
        degree_lower   = target_degree.lower()
        is_mba         = "mba" in (profile.get("field_of_study") or "").lower()

        # ── GPA ──────────────────────────────────────────────────────────────
        gpa_4 = self._gpa_to_4scale(profile.get("gpa"), profile.get("gpa_scale"))
        if gpa_4 is None:
            prerequisites.append({
                "gap":              "GPA not provided",
                "severity":         "important",
                "action":           "Add your GPA to your profile for accurate eligibility checks",
                "estimated_months": 0,
                "category":         "academic",
            })
        elif degree_lower in ("masters", "phd") and gpa_4 < 3.0:
            prerequisites.append({
                "gap":              f"GPA {gpa_4:.2f}/4.0 is below competitive threshold for {degree_lower}",
                "severity":         "critical",
                "action":           (
                    "Consider postgraduate certificate programs to build a stronger "
                    "academic record, or target programs with holistic admissions policies."
                ),
                "estimated_months": 12,
                "category":         "academic",
            })
        elif degree_lower in ("masters", "phd") and gpa_4 < 3.3:
            prerequisites.append({
                "gap":              f"GPA {gpa_4:.2f}/4.0 below the 3.3+ typical for top-100 programs",
                "severity":         "important",
                "action":           "Target programs ranked 200–500 or strengthen other areas (publications, work experience)",
                "estimated_months": 0,
                "category":         "academic",
            })

        # ── English tests ─────────────────────────────────────────────────────
        if not self._has_english_test(profile):
            ielts_target = "7.0" if degree_lower == "phd" else "6.5"
            prerequisites.append({
                "gap":              "No English proficiency test on record",
                "severity":         "critical",
                "action":           (
                    f"Take IELTS Academic (most widely accepted). "
                    f"Target band {ielts_target}+ for {degree_lower} programs. "
                    "Book via IDP or British Council — prep takes 6–12 weeks."
                ),
                "estimated_months": 3,
                "category":         "language",
            })

        # ── GMAT / GRE ────────────────────────────────────────────────────────
        gmat_gre = profile.get("gmat_gre") or {}
        needs_gmat = is_mba
        needs_gre  = degree_lower == "phd"

        if needs_gmat and not gmat_gre.get("test"):
            prerequisites.append({
                "gap":              "GMAT score not provided (required for MBA programs)",
                "severity":         "critical",
                "action":           (
                    "Register for the GMAT exam. Preparation: 2–3 months. "
                    "Target 650+ for most business schools, 700+ for top-25."
                ),
                "estimated_months": 3,
                "category":         "test",
            })
        elif needs_gre and not gmat_gre.get("test"):
            prerequisites.append({
                "gap":              "GRE score not provided (required or recommended for PhD programs)",
                "severity":         "important",
                "action":           (
                    "Many PhD programs now waive GRE, but some top programs still require it. "
                    "Check individual program requirements."
                ),
                "estimated_months": 2,
                "category":         "test",
            })

        # ── Work experience (MBA) ─────────────────────────────────────────────
        if is_mba:
            work_yrs = profile.get("work_experience_years") or 0
            if work_yrs < 2:
                prerequisites.append({
                    "gap":              f"Work experience ({work_yrs:.0f} yrs) below MBA typical minimum of 2–3 years",
                    "severity":         "critical",
                    "action":           (
                        f"Gain {max(0, 2 - work_yrs):.0f} more years of full-time professional experience. "
                        "Target management or cross-functional roles to strengthen your profile."
                    ),
                    "estimated_months": int(max(0, (2 - work_yrs) * 12)),
                    "category":         "experience",
                })

        # ── Statement of Purpose ──────────────────────────────────────────────
        sop = profile.get("statement_of_purpose") or ""
        if not sop.strip():
            prerequisites.append({
                "gap":              "Statement of Purpose not started",
                "severity":         "recommended",
                "action":           (
                    "Start drafting your SOP. Focus on: your academic journey, "
                    "why this program, what you will contribute, and your career goals. "
                    "Typical length: 500–1000 words."
                ),
                "estimated_months": 1,
                "category":         "document",
            })

        # ── Target countries ──────────────────────────────────────────────────
        if not profile.get("target_countries"):
            prerequisites.append({
                "gap":              "No target countries selected",
                "severity":         "important",
                "action":           "Select 2–4 target countries in your profile to get personalised recommendations",
                "estimated_months": 0,
                "category":         "academic",
            })

        # ── PhD-specific: publications ────────────────────────────────────────
        if degree_lower == "phd":
            pubs = profile.get("publications") or 0
            if pubs == 0:
                prerequisites.append({
                    "gap":              "No publications listed",
                    "severity":         "recommended",
                    "action":           (
                        "Research publications significantly strengthen PhD applications. "
                        "Consider conference papers, thesis research, or undergraduate research projects."
                    ),
                    "estimated_months": 6,
                    "category":         "academic",
                })

        # Sort: critical → important → recommended
        order = {"critical": 0, "important": 1, "recommended": 2}
        prerequisites.sort(key=lambda x: order.get(x["severity"], 3))

        return prerequisites

    # ─── Internal helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _gpa_to_4scale(gpa: float | None, scale: str | None) -> float | None:
        """Normalise any GPA to a 4.0 scale."""
        if gpa is None:
            return None
        if scale is None or scale == "4.0":
            return round(min(float(gpa), 4.0), 2)
        if scale == "10.0":
            return round(float(gpa) / 10.0 * 4.0, 2)
        if scale == "percentage":
            g = float(gpa)
            if g >= 90: return 4.0
            if g >= 80: return round(3.0 + (g - 80) / 10, 2)
            if g >= 70: return round(2.0 + (g - 70) / 10, 2)
            if g >= 60: return round(1.0 + (g - 60) / 10, 2)
            return round(g / 60, 2)
        return round(min(float(gpa), 4.0), 2)

    @staticmethod
    def _has_english_test(profile: dict) -> bool:
        english_tests = {"IELTS", "TOEFL", "PTE", "DUOLINGO", "CAMBRIDGE"}
        for test in (profile.get("language_tests") or []):
            name = (test.get("test_name") or "").upper()
            if name in english_tests:
                return True
        return False


# ═════════════════════════════════════════════════════════════════════════════
#  Result dataclass for attribute-style access in the routers
# ═════════════════════════════════════════════════════════════════════════════

class _UniversityCheckResult:
    """
    Lightweight result object returned by check_university_eligibility().

    The shortlist router accesses results via attributes (.eligible, .gaps,
    .match_score) rather than dict keys, so we wrap the dict in this class.
    """
    __slots__ = (
        "eligible", "score", "gaps", "recommendations",
        "hard_blocks", "soft_warnings",
    )

    def __init__(self, d: dict) -> None:
        self.eligible        = d.get("eligible", False)
        self.score           = d.get("score", 0)
        self.gaps            = d.get("gaps", [])
        self.recommendations = d.get("recommendations", [])
        self.hard_blocks     = d.get("hard_blocks", [])
        self.soft_warnings   = d.get("soft_warnings", [])

    @property
    def match_score(self) -> int:
        """Alias used by shortlist_router and profile_router."""
        return self.score


class _ScholarshipCheckResult:
    """Attribute-style wrapper for check_scholarship_eligibility() results."""
    __slots__ = (
        "eligible", "reason", "missing_criteria",
        "passed_criteria", "match_score",
    )

    def __init__(self, d: dict) -> None:
        self.eligible         = d.get("eligible", False)
        self.reason           = d.get("reason", "")
        self.missing_criteria = d.get("missing_criteria", [])
        self.passed_criteria  = d.get("passed_criteria", [])
        self.match_score      = d.get("match_score", 0)


# ─── Patch check_university_eligibility to return result object ───────────────
# We monkey-patch at module level so the existing method body is unchanged.

_orig_check_uni  = EligibilityService.check_university_eligibility
_orig_check_sch  = EligibilityService.check_scholarship_eligibility


def _check_uni_wrapped(self, profile, university) -> _UniversityCheckResult:
    return _UniversityCheckResult(_orig_check_uni(self, profile, university))


def _check_sch_wrapped(self, profile, scholarship) -> _ScholarshipCheckResult:
    return _ScholarshipCheckResult(_orig_check_sch(self, profile, scholarship))


EligibilityService.check_university_eligibility = _check_uni_wrapped
EligibilityService.check_scholarship_eligibility = _check_sch_wrapped


# ═════════════════════════════════════════════════════════════════════════════
#  run_full_eligibility_check
# ═════════════════════════════════════════════════════════════════════════════

def _run_full_eligibility_check(
    self: EligibilityService,
    profile,
    universities: list[dict],
    scholarships:  list[dict],
) -> "EligibilityCheckResponse":
    """
    Run eligibility checks for every university and scholarship in the lists
    and return a single structured response object.

    Called by:
      POST /api/profile/{user_id}/eligibility-check

    Args:
        profile:      StudentProfileModel ORM instance  OR  plain dict.
                      Both are accepted — we convert ORM to dict internally.
        universities: List of university dicts, each must have at least "id".
        scholarships: List of scholarship dicts, each must have at least "id".

    Returns:
        EligibilityCheckResponse Pydantic model.
    """
    # Late import avoids circular dependency at module load time
    from app.models.profile_models import (
        EligibilityCheckResponse,
        UniversityEligibilityResult,
        ScholarshipEligibilityResult,
    )
    from datetime import datetime, timezone

    # Normalise profile to plain dict
    if hasattr(profile, "to_dict"):
        profile_dict = profile.to_dict()
    elif hasattr(profile, "model_dump"):
        profile_dict = profile.model_dump()
    else:
        profile_dict = dict(profile)

    user_id = profile_dict.get("user_id", "")

    # ── Universities ─────────────────────────────────────────────────────────
    uni_results: list[UniversityEligibilityResult] = []
    for uni in universities:
        try:
            raw = _orig_check_uni(self, profile_dict, uni)
            uni_results.append(
                UniversityEligibilityResult(
                    university_id=str(uni.get("id", "")),
                    university_name=str(uni.get("name", "")),
                    eligible=raw["eligible"],
                    score=raw["score"],
                    gaps=raw["gaps"],
                    recommendations=raw["recommendations"],
                    hard_blocks=raw["hard_blocks"],
                    soft_warnings=raw["soft_warnings"],
                )
            )
        except Exception as exc:
            log.warning(
                "eligibility_check_uni_error",
                university=uni.get("id"),
                error=str(exc),
            )
            uni_results.append(
                UniversityEligibilityResult(
                    university_id=str(uni.get("id", "")),
                    university_name=str(uni.get("name", "")),
                    eligible=False,
                    score=0,
                    gaps=[f"Eligibility check failed: {exc}"],
                    recommendations=[],
                    hard_blocks=[],
                    soft_warnings=[],
                )
            )

    # ── Scholarships ─────────────────────────────────────────────────────────
    sch_results: list[ScholarshipEligibilityResult] = []
    for sch in scholarships:
        try:
            raw = _orig_check_sch(self, profile_dict, sch)
            sch_results.append(
                ScholarshipEligibilityResult(
                    scholarship_id=str(sch.get("id", "")),
                    scholarship_name=str(sch.get("name", "")),
                    eligible=raw["eligible"],
                    reason=raw["reason"],
                    missing_criteria=raw["missing_criteria"],
                    passed_criteria=raw["passed_criteria"],
                    match_score=raw["match_score"],
                )
            )
        except Exception as exc:
            log.warning(
                "eligibility_check_sch_error",
                scholarship=sch.get("id"),
                error=str(exc),
            )
            sch_results.append(
                ScholarshipEligibilityResult(
                    scholarship_id=str(sch.get("id", "")),
                    scholarship_name=str(sch.get("name", "")),
                    eligible=False,
                    reason=f"Check failed: {exc}",
                    missing_criteria=[],
                    passed_criteria=[],
                    match_score=0,
                )
            )

    return EligibilityCheckResponse(
        user_id=user_id,
        universities=uni_results,
        scholarships=sch_results,
        checked_at=datetime.now(timezone.utc).isoformat(),
    )


# Bind as a method
EligibilityService.run_full_eligibility_check = _run_full_eligibility_check
