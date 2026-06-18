"""
backend/tests/conftest.py
=========================
Shared pytest fixtures for the GlobalPath AI test suite.

Environment variables are patched BEFORE any app import so that
pydantic-settings picks up the test values (not the absent real ones).

Run the full suite:
    cd backend && pytest tests/ -v
"""

# ── Patch env vars before any app code is imported ────────────────────────────
import os
os.environ.setdefault("SUPABASE_JWT_SECRET",       "test-jwt-secret-globalpath-ai-32chars!!")
os.environ.setdefault("GROQ_API_KEY",              "gsk_test_fake_groq_key_not_real")
os.environ.setdefault("DATABASE_URL",              "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SUPABASE_URL",              "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY",      "test-service-key")
os.environ.setdefault("SUPABASE_ANON_KEY",         "test-anon-key")
os.environ.setdefault("UPSTASH_REDIS_REST_URL",    "")
os.environ.setdefault("UPSTASH_REDIS_REST_TOKEN",  "")
os.environ.setdefault("CHROMA_PERSIST_DIR",        "/tmp/test_chroma_globalpath")
os.environ.setdefault("EMBEDDING_MODEL",           "all-MiniLM-L6-v2")
os.environ.setdefault("APP_ENV",                   "test")
os.environ.setdefault("SECRET_KEY",                "test-secret-key-32-chars-padding!!")
os.environ.setdefault("CORS_ORIGINS",              '["http://localhost:3000"]')
os.environ.setdefault("SUPABASE_JWT_ALGORITHM",    "HS256")

# ── Standard library ──────────────────────────────────────────────────────────
import time
import uuid
import json
from unittest.mock import AsyncMock, MagicMock, patch

# ── Third-party ───────────────────────────────────────────────────────────────
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from jose import jwt as jose_jwt

# ─── JWT helper ───────────────────────────────────────────────────────────────

TEST_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]
TEST_USER_ID    = "test-user-uuid-00000001"
TEST_USER_EMAIL = "arjun.sharma.test@example.com"


def make_test_token(
    user_id: str = TEST_USER_ID,
    email:   str = TEST_USER_EMAIL,
    ttl_s:   int = 3600,
) -> str:
    """Create a signed HS256 JWT that will pass verify_supabase_token()."""
    payload = {
        "sub":   user_id,
        "email": email,
        "role":  "authenticated",
        "aud":   "authenticated",
        "iat":   int(time.time()),
        "exp":   int(time.time()) + ttl_s,
        "user_metadata": {"full_name": "Arjun Sharma"},
    }
    return jose_jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


TEST_TOKEN   = make_test_token()
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}"}

# ─── Sample student profile ───────────────────────────────────────────────────
# Indian student targeting MSc Computer Science in UK + Canada

@pytest.fixture(scope="session")
def sample_profile() -> dict:
    """
    Representative Indian student profile for eligibility and chat tests.
    Targeting MSc Computer Science in UK and Canada.
    """
    return {
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
        "languageTests":            [{"type": "IELTS", "score": 7.5, "date": "2024-06-01"}],
        "workExperienceYears":      0,
        "gmatGre":                  None,
        "statementOfPurpose":       "I am passionate about machine learning research.",
        "extracurriculars":         ["Coding club", "Hackathon winner"],
    }

# ─── Preset mock Groq responses ───────────────────────────────────────────────

GROQ_SCHOLARSHIP_PAYLOAD = {
    "type": "scholarships",
    "scholarships": [
        {
            "name":             "Chevening Scholarship 2025",
            "provider":         "UK Foreign Commonwealth & Development Office",
            "amount_usd":       40000,
            "coverage":         "fully_funded",
            "deadline":         "2025-11-05",
            "target_countries": ["United Kingdom"],
            "eligible_nationalities": ["All nationalities"],
            "url":              "https://chevening.org",
            "match_reason":     "Fully funded UK scholarship. Strong match for Indian CS graduates.",
            "competitiveness":  "very_high",
        }
    ],
    "funding_strategy": "Chevening offers full coverage. Apply early — deadline is November.",
    "total_found": 1,
}

GROQ_VISA_PAYLOAD = {
    "type": "visa",
    "visa_type":       "UK Student Visa",
    "from_country":    "India",
    "to_country":      "United Kingdom",
    "official_url":    "https://www.gov.uk/student-visa",
    "visa_steps": [
        {
            "step_number":     1,
            "title":           "Receive your CAS from the university",
            "description":     "Your university issues a Confirmation of Acceptance for Studies (CAS).",
            "documents_needed": ["Unconditional offer letter", "Deposit payment receipt"],
            "estimated_days":  7,
            "tips":            "Chase your university if the CAS takes more than 2 weeks.",
        },
        {
            "step_number":     2,
            "title":           "Gather financial and identity documents",
            "description":     "Collect all required documents listed on GOV.UK.",
            "documents_needed": ["Valid passport", "Bank statement (last 28 days)", "IELTS certificate"],
            "estimated_days":  14,
            "tips":            "Bank statement must show funds held for 28 consecutive days.",
        },
        {
            "step_number":     3,
            "title":           "Apply online and pay visa fee",
            "description":     "Submit your application on the UK Visas and Immigration portal.",
            "documents_needed": ["Completed online form", "IHS surcharge payment"],
            "estimated_days":  1,
            "tips":            "Book biometrics appointment at the same time as your application.",
        },
    ],
    "total_estimated_days":  90,
    "fee_usd_approx":        490.0,
    "financial_requirement": "Must show funds covering tuition + £1,334/month for up to 9 months.",
    "common_rejection_reasons": [
        "Insufficient financial evidence",
        "CAS number errors or expiry",
    ],
}

# ─── Mock Groq client ─────────────────────────────────────────────────────────

@pytest.fixture
def mock_groq_response():
    """
    Preset GroqClient mock.
    stream_chat() yields a JSON block then a prose sentence.
    detect_intent() returns 'scholarships' by default.
    """
    async def _stream(messages, system_prompt="", **kwargs):
        body = (
            GROQ_SCHOLARSHIP_PAYLOAD
            if "scholarship" in (system_prompt or "").lower()
            else GROQ_VISA_PAYLOAD
        )
        yield f"\n```json\n{json.dumps(body)}\n```\n\n"
        yield "Here are the best options based on your profile.\n"

    mock = MagicMock()
    mock.stream_chat  = _stream
    mock.detect_intent = AsyncMock(return_value="scholarships")
    mock.chat          = AsyncMock(return_value=(
        "Here are scholarship results for your profile.",
        GROQ_SCHOLARSHIP_PAYLOAD,
    ))
    return mock


# ─── Mock ChromaDB vector store ───────────────────────────────────────────────

@pytest.fixture
def mock_chromadb():
    """
    Preset ChromaVectorStore mock returning one relevant scholarship chunk.
    All mutating methods succeed silently.
    """
    mock = MagicMock()
    mock.query.return_value = [
        {
            "text": (
                "Scholarship: Chevening Scholarships\n"
                "Provider: UK FCDO\n"
                "Available in: United Kingdom\n"
                "Open to nationalities: All\n"
                "Degree level: masters\n"
                "Award amount: USD 40,000 per year"
            ),
            "metadata": {
                "category":    "scholarship",
                "country":     "United Kingdom",
                "record_type": "scholarship",
                "name":        "Chevening Scholarships",
            },
            "score": 0.93,
            "id":    "mock-chroma-chevening",
        }
    ]
    mock.collection_stats.return_value = {
        "collection_name": "globalpath-knowledge",
        "document_count":  42,
    }
    mock.upsert_embeddings.return_value = 5
    mock.delete_collection.return_value = None
    return mock


# ─── Mock DuckDuckGo live search ─────────────────────────────────────────────

@pytest.fixture
def mock_ddgs():
    """
    Preset LiveSearchClient mock.
    All search_*() methods return (results_list, was_cached=False).
    """
    mock = MagicMock()

    mock.search_scholarships = AsyncMock(return_value=(
        [
            {
                "title":   "Chevening Scholarships 2025–26",
                "snippet": "Fully funded UK Government scholarship for international students.",
                "url":     "https://chevening.org",
            },
            {
                "title":   "Commonwealth Scholarship Commission",
                "snippet": "Scholarships for citizens of Commonwealth countries to study in UK.",
                "url":     "https://cscuk.fcdo.gov.uk",
            },
        ],
        False,
    ))
    mock.search_visa_requirements = AsyncMock(return_value=(
        [
            {
                "title":   "Student Visa — GOV.UK",
                "snippet": "Apply for a Student visa to study in the UK. You must have a CAS.",
                "url":     "https://www.gov.uk/student-visa",
            },
        ],
        False,
    ))
    mock.search_universities = AsyncMock(return_value=(
        [
            {
                "title":   "University of Toronto — International Students",
                "snippet": "Canada's highest-ranked university. Strong CS and AI programs.",
                "url":     "https://www.utoronto.ca",
            },
        ],
        False,
    ))
    mock.search_cost_of_living = AsyncMock(return_value=([], False))
    mock.search_general        = AsyncMock(return_value=([], False))
    return mock


# ─── In-memory SQLite test database ──────────────────────────────────────────

@pytest_asyncio.fixture
async def test_db():
    """
    Async SQLAlchemy session backed by SQLite in-memory.
    Tables are created fresh and dropped after each test function.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker

    # Import Base — this triggers all ORM model registrations
    try:
        from app.models.database import Base
    except ImportError:
        # Fallback: define a minimal Base for pure unit tests
        from sqlalchemy.orm import DeclarativeBase
        class Base(DeclarativeBase):  # type: ignore[no-redef]
            pass

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncSessionLocal = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with AsyncSessionLocal() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ─── Full async test client ───────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_client(mock_groq_response, mock_chromadb, mock_ddgs, test_db):
    """
    httpx.AsyncClient wired to the FastAPI app with all heavy dependencies
    replaced by mocks:

    Overrides:
      verify_supabase_token  → returns fake authenticated user dict
      get_db                 → yields in-memory SQLite session
      GroqClient             → mock_groq_response fixture
      ChromaVectorStore      → mock_chromadb fixture
      LiveSearchClient       → mock_ddgs fixture
    """
    from app.main                      import app
    from app.auth.supabase_middleware  import verify_supabase_token
    from app.models.database           import get_db

    # Override: JWT verification always succeeds for the test user
    def _fake_jwt():
        return {
            "sub":   TEST_USER_ID,
            "email": TEST_USER_EMAIL,
            "role":  "authenticated",
            "user_metadata": {"full_name": "Arjun Sharma"},
        }

    # Override: DB → in-memory SQLite
    async def _fake_db():
        yield test_db

    app.dependency_overrides[verify_supabase_token] = _fake_jwt
    app.dependency_overrides[get_db]                = _fake_db

    patch_targets = {
        "app.ai.groq_client.GroqClient":              mock_groq_response,
        "app.rag.vector_store.ChromaVectorStore":      mock_chromadb,
        "app.search.live_search.LiveSearchClient":     mock_ddgs,
        "app.rag.embedder.Embedder":                   MagicMock(),
    }

    with (
        patch("app.ai.groq_client.GroqClient",             return_value=mock_groq_response),
        patch("app.rag.vector_store.ChromaVectorStore",     return_value=mock_chromadb),
        patch("app.search.live_search.LiveSearchClient",    return_value=mock_ddgs),
        patch("app.rag.embedder.Embedder",                  return_value=MagicMock(
            embed_query=MagicMock(return_value=[0.1] * 384)
        )),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            timeout=10.0,
        ) as client:
            yield client

    app.dependency_overrides.clear()
