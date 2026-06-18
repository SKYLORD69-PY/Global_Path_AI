"""
backend/tests/test_eligibility.py
===================================
Unit tests for EligibilityService logic.

All tests operate on plain Python objects — no DB session needed because
check_university_eligibility() and check_scholarship_eligibility() are
pure computation methods that accept dicts/dataclasses and return results
with .eligible / .gaps / .match_score attributes.

Covered:
  ✓ IELTS 7.5  vs requirement 7.0  → eligible=True,  gaps=[]
  ✓ IELTS 6.0  vs requirement 7.0  → eligible=False, gaps has IELTS message
  ✓ Indian student + Chevening      → eligible=True
  ✓ Non-UK-target + Chevening       → eligible=False
  ✓ PhD applicant without Master's  → gaps includes Master's required message
"""

import pytest
from unittest.mock import MagicMock, AsyncMock

pytestmark = pytest.mark.asyncio


# ─── Helpers — build minimal profile and university dicts ─────────────────────

def _make_profile(**overrides) -> dict:
    """Base Indian CS student profile with IELTS 7.5, targeting UK + Canada."""
    base = {
        "nationality":             "Indian",
        "homeCountry":             "India",
        "currentEducationLevel":   "bachelors",
        "targetDegree":            "masters",
        "fieldOfStudy":            "Computer Science",
        "targetCountries":         ["United Kingdom", "Canada"],
        "budgetMax":               40000,
        "gpa":                     3.6,
        "languageTests":           [{"type": "IELTS", "score": 7.5}],
        "workExperienceYears":     0,
    }
    base.update(overrides)
    return base


def _make_university(**overrides) -> dict:
    """Base university requiring IELTS 7.0 and GPA 3.0."""
    base = {
        "id":                   "test-uni-uuid-001",
        "name":                 "University of Edinburgh",
        "country":              "United Kingdom",
        "city":                 "Edinburgh",
        "qs_rank":              27,
        "tuition_usd":          32000,
        "ielts_min":            7.0,
        "toefl_min":            100,
        "gpa_min":              3.0,
        "accepts_gre":          False,
        "application_deadline": "March 31",
        "programs":             ["Computer Science", "Data Science"],
    }
    base.update(overrides)
    return base


def _make_scholarship(**overrides) -> dict:
    """Base Chevening scholarship dict."""
    base = {
        "id":                     "chevening-2025",
        "name":                   "Chevening Scholarship",
        "provider":               "UK FCDO",
        "amount_usd":             40000,
        "coverage":               "fully_funded",
        "target_countries":       ["United Kingdom"],
        "eligible_nationalities": [],            # empty = all nationalities
        "degree_levels":          ["masters"],
        "min_work_experience_years": 2,
        "deadline":               "2025-11-05",
        "url":                    "https://chevening.org",
    }
    base.update(overrides)
    return base


def _get_ielts_score(profile: dict) -> float:
    """Extract IELTS band from the languageTests list."""
    for test in (profile.get("languageTests") or []):
        if test.get("type", "").upper() == "IELTS":
            return float(test.get("score", 0))
    return 0.0


def _instantiate_service(db=None):
    """
    Instantiate EligibilityService.
    Accepts an optional mock db for methods that query the database.
    """
    from app.services.eligibility_service import EligibilityService
    mock_db = db or MagicMock()
    return EligibilityService(mock_db)


# ─── 1. IELTS 7.5 vs requirement 7.0 → eligible ──────────────────────────────

def test_ielts_above_minimum_is_eligible():
    """
    A student with IELTS 7.5 applying to a university that requires 7.0
    should be eligible with an empty gaps list.
    """
    svc     = _instantiate_service()
    profile = _make_profile(languageTests=[{"type": "IELTS", "score": 7.5}])
    uni     = _make_university(ielts_min=7.0)

    result = svc.check_university_eligibility(profile, uni)

    assert result.eligible is True, (
        f"Expected eligible=True for IELTS 7.5 vs 7.0 requirement, got: {result.eligible}"
    )
    assert result.gaps == [], (
        f"Expected no gaps for IELTS 7.5 vs 7.0 requirement, got: {result.gaps}"
    )
    assert result.match_score > 0, "match_score should be positive for an eligible applicant"


def test_ielts_equal_to_minimum_is_eligible():
    """
    IELTS equal to the minimum requirement should also be eligible.
    """
    svc     = _instantiate_service()
    profile = _make_profile(languageTests=[{"type": "IELTS", "score": 7.0}])
    uni     = _make_university(ielts_min=7.0)

    result = svc.check_university_eligibility(profile, uni)

    assert result.eligible is True, (
        "IELTS exactly at the minimum should be eligible"
    )
    assert result.gaps == [], f"No gaps expected, got: {result.gaps}"


# ─── 2. IELTS 6.0 vs requirement 7.0 → not eligible ─────────────────────────

def test_ielts_below_minimum_is_not_eligible():
    """
    A student with IELTS 6.0 applying to a university that requires 7.0
    should be ineligible with a descriptive IELTS gap in the gaps list.
    """
    svc     = _instantiate_service()
    profile = _make_profile(languageTests=[{"type": "IELTS", "score": 6.0}])
    uni     = _make_university(ielts_min=7.0)

    result = svc.check_university_eligibility(profile, uni)

    assert result.eligible is False, (
        f"Expected eligible=False for IELTS 6.0 vs 7.0 requirement, got: {result.eligible}"
    )
    assert len(result.gaps) >= 1, (
        f"Expected at least one gap for IELTS shortfall, got: {result.gaps}"
    )

    # The gap message must reference the student's score and the requirement
    ielts_gap = next(
        (g for g in result.gaps if "ielts" in g.lower() or "6.0" in g or "7.0" in g),
        None,
    )
    assert ielts_gap is not None, (
        f"Expected an IELTS-related gap message. Gaps found: {result.gaps}"
    )
    assert "6.0" in ielts_gap or "6" in ielts_gap, (
        f"Gap message should mention the student's score 6.0. Got: {ielts_gap}"
    )
    assert "7.0" in ielts_gap or "7" in ielts_gap, (
        f"Gap message should mention the requirement 7.0. Got: {ielts_gap}"
    )


def test_ielts_gap_message_format():
    """
    The exact gap message for IELTS shortfall should match the canonical
    format used throughout the application.
    """
    svc     = _instantiate_service()
    profile = _make_profile(languageTests=[{"type": "IELTS", "score": 6.0}])
    uni     = _make_university(ielts_min=7.0)

    result = svc.check_university_eligibility(profile, uni)

    # Find the IELTS gap
    ielts_gaps = [g for g in result.gaps if "ielts" in g.lower()]
    assert ielts_gaps, f"Expected an IELTS gap message. All gaps: {result.gaps}"

    gap = ielts_gaps[0].lower()
    # Must mention both the actual score and the requirement
    assert "6.0" in gap or "6" in gap, f"Gap should contain student score. Got: {gap}"
    assert "7.0" in gap or "7" in gap, f"Gap should contain requirement. Got: {gap}"
    # Must contain language indicating shortfall
    assert any(word in gap for word in ("below", "insufficient", "required", "minimum", "need")), (
        f"Gap message should describe the shortfall. Got: {gap}"
    )


# ─── 3. Indian student + Chevening → eligible ────────────────────────────────

def test_indian_student_eligible_for_chevening():
    """
    An Indian national targeting the United Kingdom should be eligible for
    Chevening (which is open to all nationalities for UK study).
    """
    svc = _instantiate_service()
    profile = _make_profile(
        nationality=    "Indian",
        targetCountries=["United Kingdom", "Canada"],
        languageTests=  [{"type": "IELTS", "score": 7.5}],
        workExperienceYears=2,   # Chevening typically requires 2+ years
    )
    scholarship = _make_scholarship(
        eligible_nationalities=[],           # empty = open to all
        target_countries=["United Kingdom"],
        min_work_experience_years=2,
    )

    result = svc.check_scholarship_eligibility(profile, scholarship)

    assert result.eligible is True, (
        f"Expected Indian student to be eligible for Chevening. Got eligible={result.eligible}, "
        f"gaps={getattr(result, 'gaps', [])}"
    )


def test_chevening_requires_uk_as_target_country():
    """
    Chevening is a UK scholarship.
    A student not targeting the UK should be ineligible.
    """
    svc = _instantiate_service()
    profile = _make_profile(
        nationality=    "Indian",
        targetCountries=["Germany", "Canada"],   # UK not in target countries
        workExperienceYears=2,
    )
    scholarship = _make_scholarship(
        target_countries=["United Kingdom"],
        min_work_experience_years=2,
    )

    result = svc.check_scholarship_eligibility(profile, scholarship)

    assert result.eligible is False, (
        f"Expected ineligible (UK not in target countries). Got eligible={result.eligible}"
    )

    # There should be a gap about not targeting the scholarship country
    gaps_lower = [g.lower() for g in getattr(result, "gaps", [])]
    country_gap = any(
        "uk" in g or "united kingdom" in g or "target" in g or "country" in g
        for g in gaps_lower
    )
    assert country_gap, (
        f"Expected a gap about not targeting UK. Gaps: {getattr(result, 'gaps', [])}"
    )


def test_chevening_ineligible_when_no_target_countries_set():
    """Empty target countries list → ineligible for any country-specific scholarship."""
    svc = _instantiate_service()
    profile     = _make_profile(targetCountries=[], workExperienceYears=2)
    scholarship = _make_scholarship(target_countries=["United Kingdom"])

    result = svc.check_scholarship_eligibility(profile, scholarship)

    assert result.eligible is False, (
        "No target countries → should be ineligible for a country-specific scholarship"
    )


# ─── 4. PhD applicant without Master's ───────────────────────────────────────

def test_phd_applicant_without_masters_has_prerequisite_gap():
    """
    A student whose current education level is 'bachelors' applying for a
    PhD should receive a gap indicating a Master's degree is required.
    """
    svc = _instantiate_service()
    profile = _make_profile(
        currentEducationLevel="bachelors",   # no Master's yet
        targetDegree="phd",
    )
    uni = _make_university(
        name="University of Cambridge",
        ielts_min=7.5,
        gpa_min=3.7,
    )

    result = svc.check_university_eligibility(profile, uni)

    # Collect all gaps as lower-case strings for matching
    gaps_lower = [g.lower() for g in result.gaps]
    master_gap = any(
        "master" in g or "postgraduate" in g or "graduate degree" in g
        for g in gaps_lower
    )
    assert master_gap, (
        f"Expected a gap about Master's requirement for PhD. Gaps: {result.gaps}"
    )


def test_phd_applicant_without_masters_via_prerequisites():
    """
    get_missing_prerequisites() should include a Master's-related item
    when a bachelor's student targets a PhD.
    """
    svc = _instantiate_service()
    profile = _make_profile(
        currentEducationLevel="bachelors",
        targetDegree="phd",
    )

    prereqs = svc.get_missing_prerequisites(profile, target_degree="phd")

    # prereqs is a list of dicts with at least {"item": "...", ...}
    assert isinstance(prereqs, list), f"Expected list, got {type(prereqs)}"
    assert len(prereqs) >= 1, (
        "Expected at least one missing prerequisite for a bachelor's student applying to PhD"
    )

    prereq_texts = " ".join(
        str(p.get("item", p.get("label", p))) for p in prereqs
    ).lower()
    assert "master" in prereq_texts or "postgraduate" in prereq_texts, (
        f"Expected a Master's prerequisite. Got: {prereqs}"
    )


def test_masters_applicant_with_bachelors_is_ok():
    """
    A student with bachelors applying for a Master's has no education-level gap.
    """
    svc = _instantiate_service()
    profile = _make_profile(
        currentEducationLevel="bachelors",
        targetDegree="masters",
    )
    uni = _make_university(ielts_min=6.5, gpa_min=3.0)

    result = svc.check_university_eligibility(profile, uni)

    # Should be no gap about education level for a bachelor's → master's application
    gaps_lower = [g.lower() for g in result.gaps]
    education_gap = any(
        "bachelor" in g or "undergraduate" in g or "degree required" in g
        for g in gaps_lower
    )
    assert not education_gap, (
        f"Bachelor's student applying for Master's should not have an education-level gap. "
        f"Got gaps: {result.gaps}"
    )


# ─── 5. GPA below requirement ────────────────────────────────────────────────

def test_low_gpa_produces_gap():
    """A GPA of 2.5 vs a 3.0 minimum should produce a GPA gap."""
    svc     = _instantiate_service()
    profile = _make_profile(gpa=2.5)
    uni     = _make_university(gpa_min=3.0)

    result = svc.check_university_eligibility(profile, uni)

    gaps_lower = [g.lower() for g in result.gaps]
    gpa_gap = any("gpa" in g or "grade" in g or "2.5" in g for g in gaps_lower)
    assert gpa_gap, f"Expected a GPA gap for 2.5 vs 3.0. Gaps: {result.gaps}"


def test_sufficient_gpa_no_gap():
    """A GPA of 3.8 vs a 3.0 minimum should produce no GPA gap."""
    svc     = _instantiate_service()
    profile = _make_profile(gpa=3.8)
    uni     = _make_university(gpa_min=3.0)

    result = svc.check_university_eligibility(profile, uni)

    gaps_lower = [g.lower() for g in result.gaps]
    gpa_gap = any("gpa" in g or "grade" in g for g in gaps_lower)
    assert not gpa_gap, f"No GPA gap expected for 3.8 vs 3.0. Gaps: {result.gaps}"


# ─── 6. run_full_eligibility_check ───────────────────────────────────────────

async def test_full_eligibility_check_returns_response_object():
    """
    run_full_eligibility_check() with empty lists should return a valid
    EligibilityCheckResponse (not raise an exception).
    """
    svc     = _instantiate_service()
    profile = _make_profile()

    response = await svc.run_full_eligibility_check(profile, [], [])

    from app.models.profile_models import EligibilityCheckResponse
    assert isinstance(response, EligibilityCheckResponse), (
        f"Expected EligibilityCheckResponse, got {type(response)}"
    )


async def test_full_eligibility_check_with_eligible_university():
    """
    run_full_eligibility_check with a matching university should include
    it in the universities result list as eligible.
    """
    svc     = _instantiate_service()
    profile = _make_profile(
        languageTests=[{"type": "IELTS", "score": 7.5}],
        gpa=3.6,
    )
    unis = [_make_university(ielts_min=7.0, gpa_min=3.0)]

    response = await svc.run_full_eligibility_check(profile, unis, [])

    results = getattr(response, "universities", [])
    assert len(results) == 1, f"Expected 1 university result, got {len(results)}"
    assert results[0].eligible is True, (
        f"Expected eligible=True for well-qualified student. Got: {results[0].eligible}"
    )
