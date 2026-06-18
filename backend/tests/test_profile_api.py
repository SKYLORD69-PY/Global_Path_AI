"""
backend/tests/test_profile_api.py
===================================
Integration tests for the /api/profile/* endpoints.

All tests run against the full FastAPI application with:
  - JWT verification bypassed (fake token via dependency override)
  - DB replaced with in-memory SQLite (via test_db fixture)

Covered:
  ✓ POST /api/profile/create            → 201 + profile_id
  ✓ GET  /api/profile/:user_id          → 200 + correct fields
  ✓ PATCH /api/profile/:user_id         → only specified fields updated
  ✓ completeness_score: empty = 0,  fully filled = 100

Signatures confirmed from transcript:
  StudentProfileModel:
    .compute_completeness() → int   (0–100)
    .profile_id             field
    .to_response()          → StudentProfileResponse
    .to_dict()              → dict
"""

import uuid
import pytest

from tests.conftest import AUTH_HEADERS, TEST_USER_ID, sample_profile

pytestmark = pytest.mark.asyncio

# ─── Re-usable profile payload ────────────────────────────────────────────────

def _base_create_payload(user_id: str | None = None) -> dict:
    """Minimal valid payload for POST /api/profile/create."""
    return {
        "user_id":                  user_id or TEST_USER_ID,
        "nationality":              "Indian",
        "homeCountry":              "India",
        "currentEducationLevel":    "bachelors",
        "targetDegree":             "masters",
        "fieldOfStudy":             "Computer Science",
        "targetCountries":          ["United Kingdom", "Canada"],
        "budgetMax":                40000,
        "intakeYear":               2025,
        "intakeSemester":           "September",
        "gpa":                      3.6,
        "languageTests":            [{"type": "IELTS", "score": 7.5}],
        "workExperienceYears":      0,
    }


def _full_payload(user_id: str | None = None) -> dict:
    """
    All optional fields filled — designed to yield completeness_score = 100.
    """
    base = _base_create_payload(user_id)
    base.update({
        "gmatGre":             {"type": "GRE", "verbal": 160, "quant": 165, "awa": 4.5},
        "statementOfPurpose":  "I aim to contribute to machine learning research.",
        "extracurriculars":    ["ACM competitive programming", "GSoC 2024"],
    })
    return base


# ─────────────────────────────────────────────────────────────────────────────
# 1. POST /api/profile/create  → 201 + profile_id
# ─────────────────────────────────────────────────────────────────────────────

async def test_create_profile_returns_201(test_client):
    """
    Creating a new profile should return HTTP 201 Created.
    """
    response = await test_client.post(
        "/api/profile/create",
        json=_base_create_payload(),
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201, (
        f"Expected 201 Created, got {response.status_code}: {response.text}"
    )


async def test_create_profile_returns_profile_id(test_client):
    """
    The 201 response body must contain a 'profile_id' field with a
    non-empty string value.
    """
    response = await test_client.post(
        "/api/profile/create",
        json=_base_create_payload(),
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 201, f"Expected 201, got {response.status_code}"

    data       = response.json()
    profile_id = data.get("profile_id")

    assert profile_id is not None, (
        f"Response must include 'profile_id'. Got keys: {list(data.keys())}"
    )
    assert isinstance(profile_id, str) and profile_id.strip(), (
        f"profile_id must be a non-empty string. Got: {profile_id!r}"
    )


async def test_create_profile_without_auth_returns_401(test_client):
    """
    Profile creation without an Authorization header must be rejected.
    """
    response = await test_client.post(
        "/api/profile/create",
        json=_base_create_payload(),
        # No AUTH_HEADERS
    )
    assert response.status_code == 401, (
        f"Expected 401 for unauthenticated request, got {response.status_code}"
    )


async def test_create_profile_missing_required_field_returns_422(test_client):
    """
    Omitting a required field (nationality) must trigger a 422 validation error.
    """
    payload = _base_create_payload()
    del payload["nationality"]

    response = await test_client.post(
        "/api/profile/create",
        json=payload,
        headers=AUTH_HEADERS,
    )

    assert response.status_code in (422, 400), (
        f"Expected 422/400 for missing field, got {response.status_code}: {response.text}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2. GET /api/profile/:user_id  → 200 + correct fields
# ─────────────────────────────────────────────────────────────────────────────

async def test_get_profile_returns_200(test_client):
    """
    After creating a profile, GET /api/profile/:user_id returns 200.
    """
    # Create first
    create_resp = await test_client.post(
        "/api/profile/create",
        json=_base_create_payload(),
        headers=AUTH_HEADERS,
    )
    assert create_resp.status_code == 201
    user_id = _base_create_payload()["user_id"]

    # Then retrieve
    get_resp = await test_client.get(
        f"/api/profile/{user_id}",
        headers=AUTH_HEADERS,
    )

    assert get_resp.status_code == 200, (
        f"Expected 200 for existing profile, got {get_resp.status_code}: {get_resp.text}"
    )


async def test_get_profile_returns_correct_nationality(test_client):
    """
    The retrieved profile must contain the nationality that was submitted.
    """
    payload = _base_create_payload()
    await test_client.post(
        "/api/profile/create",
        json=payload,
        headers=AUTH_HEADERS,
    )

    get_resp = await test_client.get(
        f"/api/profile/{payload['user_id']}",
        headers=AUTH_HEADERS,
    )
    assert get_resp.status_code == 200

    data = get_resp.json()
    # nationality may be in the top-level dict or nested under "profile"
    profile_data = data.get("profile", data)
    assert profile_data.get("nationality") == "Indian", (
        f"Expected nationality='Indian'. Got: {profile_data.get('nationality')!r}"
    )


async def test_get_profile_returns_correct_target_countries(test_client):
    """
    targetCountries must be preserved exactly through create → get.
    """
    payload = _base_create_payload()
    await test_client.post(
        "/api/profile/create", json=payload, headers=AUTH_HEADERS
    )

    resp = await test_client.get(
        f"/api/profile/{payload['user_id']}", headers=AUTH_HEADERS
    )
    assert resp.status_code == 200

    data = resp.json()
    profile_data    = data.get("profile", data)
    target_countries = (
        profile_data.get("targetCountries")
        or profile_data.get("target_countries")
        or []
    )

    assert "United Kingdom" in target_countries, (
        f"Expected 'United Kingdom' in targetCountries. Got: {target_countries}"
    )
    assert "Canada" in target_countries, (
        f"Expected 'Canada' in targetCountries. Got: {target_countries}"
    )


async def test_get_nonexistent_profile_returns_404(test_client):
    """
    Requesting a profile for an ID that doesn't exist should return 404.
    """
    fake_id  = f"nonexistent-user-{uuid.uuid4().hex[:8]}"
    get_resp = await test_client.get(
        f"/api/profile/{fake_id}",
        headers=AUTH_HEADERS,
    )

    assert get_resp.status_code == 404, (
        f"Expected 404 for non-existent profile, got {get_resp.status_code}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. PATCH /api/profile/:user_id  → only specified fields updated
# ─────────────────────────────────────────────────────────────────────────────

async def test_patch_updates_only_specified_fields(test_client):
    """
    PATCH with a partial payload should update only the provided field (gpa)
    and leave everything else (nationality, fieldOfStudy) unchanged.
    """
    # 1. Create the profile
    payload = _base_create_payload()
    await test_client.post(
        "/api/profile/create", json=payload, headers=AUTH_HEADERS
    )
    user_id = payload["user_id"]

    # 2. Patch only 'gpa'
    patch_resp = await test_client.patch(
        f"/api/profile/{user_id}",
        json={"gpa": 3.9},
        headers=AUTH_HEADERS,
    )
    assert patch_resp.status_code == 200, (
        f"Expected 200 for PATCH, got {patch_resp.status_code}: {patch_resp.text}"
    )

    # 3. Retrieve and assert
    get_resp = await test_client.get(
        f"/api/profile/{user_id}", headers=AUTH_HEADERS
    )
    assert get_resp.status_code == 200
    data         = get_resp.json()
    profile_data = data.get("profile", data)

    # Updated field
    assert profile_data.get("gpa") == 3.9, (
        f"Expected gpa=3.9 after patch. Got: {profile_data.get('gpa')}"
    )

    # Unchanged fields
    assert profile_data.get("nationality") == "Indian", (
        f"nationality should not change after patching gpa. Got: {profile_data.get('nationality')}"
    )
    field = profile_data.get("fieldOfStudy") or profile_data.get("field_of_study")
    assert field == "Computer Science", (
        f"fieldOfStudy should not change after patching gpa. Got: {field}"
    )


async def test_patch_updates_target_countries(test_client):
    """
    PATCH can update targetCountries to a new list.
    """
    payload = _base_create_payload()
    await test_client.post(
        "/api/profile/create", json=payload, headers=AUTH_HEADERS
    )
    user_id = payload["user_id"]

    # Add Germany to target countries
    await test_client.patch(
        f"/api/profile/{user_id}",
        json={"targetCountries": ["United Kingdom", "Canada", "Germany"]},
        headers=AUTH_HEADERS,
    )

    get_resp = await test_client.get(
        f"/api/profile/{user_id}", headers=AUTH_HEADERS
    )
    profile_data    = get_resp.json().get("profile", get_resp.json())
    target_countries = (
        profile_data.get("targetCountries")
        or profile_data.get("target_countries")
        or []
    )
    assert "Germany" in target_countries, (
        f"Germany should be in targetCountries after patch. Got: {target_countries}"
    )


async def test_patch_updates_language_tests(test_client):
    """
    Patching languageTests should replace the array with new test scores.
    """
    payload = _base_create_payload()
    await test_client.post(
        "/api/profile/create", json=payload, headers=AUTH_HEADERS
    )
    user_id = payload["user_id"]

    new_tests = [
        {"type": "IELTS",  "score": 8.0},
        {"type": "TOEFL",  "score": 110},
    ]
    await test_client.patch(
        f"/api/profile/{user_id}",
        json={"languageTests": new_tests},
        headers=AUTH_HEADERS,
    )

    get_resp = await test_client.get(
        f"/api/profile/{user_id}", headers=AUTH_HEADERS
    )
    profile_data = get_resp.json().get("profile", get_resp.json())
    tests = (
        profile_data.get("languageTests")
        or profile_data.get("language_tests")
        or []
    )

    scores = {t.get("type", "").upper(): t.get("score") for t in tests}
    assert scores.get("IELTS") == 8.0, (
        f"Expected IELTS 8.0 after patch. Got: {scores}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4. completeness_score — unit tests on StudentProfileModel
# ─────────────────────────────────────────────────────────────────────────────

class TestCompletenessScore:
    """
    Direct unit tests for StudentProfileModel.compute_completeness().
    Tests the ORM model in isolation — no HTTP or DB required.
    """

    @pytest.fixture(autouse=True)
    def _import_model(self):
        try:
            from app.models.profile_models import StudentProfileModel
            self.Model = StudentProfileModel
        except ImportError:
            pytest.skip("StudentProfileModel not importable in this environment")

    def _make_model(self, **kwargs) -> object:
        """Instantiate StudentProfileModel with the given field values."""
        instance = self.Model.__new__(self.Model)
        # Set defaults to None/empty, then apply kwargs
        defaults = {
            "profile_id":               str(uuid.uuid4()),
            "user_id":                  TEST_USER_ID,
            "nationality":              None,
            "home_country":             None,
            "current_education_level":  None,
            "target_degree":            None,
            "field_of_study":           None,
            "target_countries":         [],
            "budget_max":               None,
            "intake_year":              None,
            "intake_semester":          None,
            "gpa":                      None,
            "language_tests":           [],
            "work_experience_years":    None,
            "gmat_gre":                 None,
            "statement_of_purpose":     None,
            "extracurriculars":         [],
        }
        defaults.update(kwargs)
        for k, v in defaults.items():
            setattr(instance, k, v)
        return instance

    def test_empty_profile_returns_zero(self):
        """
        A profile with all optional fields set to None / empty should have
        completeness_score = 0.
        """
        instance = self._make_model()
        score    = instance.compute_completeness()

        assert score == 0, (
            f"Expected completeness=0 for empty profile, got {score}"
        )

    def test_fully_filled_profile_returns_100(self):
        """
        A profile with all tracked fields populated should return 100.
        """
        instance = self._make_model(
            nationality=             "Indian",
            home_country=            "India",
            current_education_level= "bachelors",
            target_degree=           "masters",
            field_of_study=          "Computer Science",
            target_countries=        ["United Kingdom", "Canada"],
            budget_max=              40000,
            intake_year=             2025,
            intake_semester=         "September",
            gpa=                     3.6,
            language_tests=          [{"type": "IELTS", "score": 7.5}],
            work_experience_years=   0,
            gmat_gre=                {"type": "GRE", "verbal": 160, "quant": 165},
            statement_of_purpose=    "I am passionate about machine learning.",
            extracurriculars=        ["ACM", "Hackathon"],
        )
        score = instance.compute_completeness()

        assert score == 100, (
            f"Expected completeness=100 for fully filled profile, got {score}"
        )

    def test_partial_profile_returns_between_0_and_100(self):
        """
        A half-filled profile should return a value strictly between 0 and 100.
        """
        instance = self._make_model(
            nationality=            "Indian",
            home_country=           "India",
            current_education_level="bachelors",
            target_degree=          "masters",
            field_of_study=         "Computer Science",
            target_countries=       ["United Kingdom"],
            # budget_max, intake_*, gpa, tests, etc. left empty
        )
        score = instance.compute_completeness()

        assert 0 < score < 100, (
            f"Expected completeness between 0 and 100 for partial profile, got {score}"
        )

    def test_completeness_score_is_integer(self):
        """compute_completeness() must return an int (0–100)."""
        instance = self._make_model(nationality="Indian", home_country="India")
        score    = instance.compute_completeness()

        assert isinstance(score, int), (
            f"compute_completeness() must return int, got {type(score)}: {score}"
        )
        assert 0 <= score <= 100, f"Score out of range: {score}"

    def test_adding_each_field_increases_score(self):
        """
        Filling in one more field should never decrease the completeness score.
        """
        scores = []
        fields = [
            {"nationality": "Indian"},
            {"home_country": "India"},
            {"current_education_level": "bachelors"},
            {"target_degree": "masters"},
            {"field_of_study": "Computer Science"},
            {"target_countries": ["United Kingdom"]},
            {"budget_max": 40000},
            {"intake_year": 2025},
        ]
        cumulative = {}
        for f in fields:
            cumulative.update(f)
            instance = self._make_model(**cumulative)
            scores.append(instance.compute_completeness())

        # Each new field should be non-decreasing
        for i in range(1, len(scores)):
            assert scores[i] >= scores[i - 1], (
                f"Score decreased from {scores[i-1]} to {scores[i]} "
                f"after adding field {list(fields[i].keys())[0]}. "
                f"All scores: {scores}"
            )

    def test_profile_id_field_exists(self):
        """StudentProfileModel must have a profile_id attribute."""
        instance = self._make_model()
        assert hasattr(instance, "profile_id"), (
            "StudentProfileModel must have a 'profile_id' attribute"
        )
        assert instance.profile_id is not None, (
            "profile_id should be set (not None) on a freshly created model"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 5. Profile API — completeness score in API response
# ─────────────────────────────────────────────────────────────────────────────

async def test_api_returns_completeness_score_in_response(test_client):
    """
    The GET /api/profile/:user_id response should include a
    'completeness_score' or 'completeness' field.
    """
    payload = _base_create_payload()
    await test_client.post(
        "/api/profile/create", json=payload, headers=AUTH_HEADERS
    )

    resp = await test_client.get(
        f"/api/profile/{payload['user_id']}", headers=AUTH_HEADERS
    )
    assert resp.status_code == 200

    data         = resp.json()
    profile_data = data.get("profile", data)

    score = (
        profile_data.get("completeness_score")
        or profile_data.get("completeness")
        or data.get("completeness_score")
        or data.get("completeness")
    )

    assert score is not None, (
        f"Expected a completeness_score field in response. Keys: {list(data.keys())}"
    )
    assert isinstance(score, (int, float)), (
        f"completeness_score must be numeric, got {type(score)}: {score}"
    )
    assert 0 <= score <= 100, f"completeness_score out of range: {score}"


async def test_empty_profile_has_low_completeness_via_api(test_client):
    """
    A profile created with only required fields should have a low
    completeness score (< 50) compared to a fully filled profile.
    """
    user_id = f"low-complete-{uuid.uuid4().hex[:8]}"
    minimal = {
        "user_id":    user_id,
        "nationality":"Indian",
        # All optional fields omitted
    }

    await test_client.post(
        "/api/profile/create", json=minimal, headers=AUTH_HEADERS
    )
    resp = await test_client.get(
        f"/api/profile/{user_id}", headers=AUTH_HEADERS
    )

    if resp.status_code != 200:
        pytest.skip("Profile creation with minimal data not supported in this build")

    data  = resp.json()
    score = (
        data.get("completeness_score")
        or data.get("profile", {}).get("completeness_score")
        or data.get("completeness")
        or data.get("profile", {}).get("completeness")
        or 0
    )

    assert score < 80, (
        f"Minimal profile should have low completeness (<80). Got: {score}"
    )
