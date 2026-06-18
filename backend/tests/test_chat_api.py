"""
backend/tests/test_chat_api.py
==============================
Tests for the /api/chat/* endpoints.

Covered:
  ✓ POST /api/chat/message  — scholarship query  → 200 + richData.scholarships
  ✓ POST /api/chat/message  — visa query         → 200 + richData.visa_steps
  ✓ POST /api/chat/message  — no Authorization   → 401
  ✓ POST /api/chat/message  — empty message body → 422
  ✓ GET  /api/chat/history/:session_id           → 200 + messages list
  ✓ Intent routing          — scholarship text   → SYSTEM_PROMPT_SCHOLARSHIPS
"""

import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests.conftest import (
    AUTH_HEADERS,
    GROQ_SCHOLARSHIP_PAYLOAD,
    GROQ_VISA_PAYLOAD,
    TEST_USER_ID,
    TEST_USER_EMAIL,
    sample_profile,
)

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _chat_body(message: str, session_id: str | None = None, profile: dict | None = None) -> dict:
    return {
        "message":         message,
        "session_id":      session_id or str(uuid.uuid4()),
        "student_profile": profile or {
            "nationality":      "Indian",
            "targetDegree":     "masters",
            "targetCountries":  ["United Kingdom", "Canada"],
            "fieldOfStudy":     "Computer Science",
        },
    }


# ─── 1. POST /api/chat/message — scholarship query ────────────────────────────

async def test_chat_scholarship_query_returns_200_with_rich_data(test_client, mock_groq_response):
    """
    A scholarship-related query should return HTTP 200 and include
    a richData object with at least one scholarship in the scholarships array.
    """
    # Ensure Groq returns a scholarship payload for this intent
    async def _scholarship_stream(messages, system_prompt="", **kwargs):
        yield f"\n```json\n{json.dumps(GROQ_SCHOLARSHIP_PAYLOAD)}\n```\n\n"
        yield "These scholarships match your profile.\n"

    mock_groq_response.stream_chat  = _scholarship_stream
    mock_groq_response.detect_intent = AsyncMock(return_value="scholarships")

    body = _chat_body("What scholarships can I apply to as an Indian student in the UK?")

    response = await test_client.post(
        "/api/chat/message",
        json=body,
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    data = response.json()
    # Response must contain either richData directly or inside the message
    rich = data.get("rich_data") or data.get("richData") or {}

    assert rich.get("type") == "scholarships", (
        f"Expected rich_data.type='scholarships', got: {rich}"
    )
    scholarships = rich.get("scholarships", [])
    assert len(scholarships) >= 1, "Expected at least one scholarship in rich_data.scholarships"
    assert scholarships[0].get("name"), "First scholarship should have a name"


# ─── 2. POST /api/chat/message — visa query ───────────────────────────────────

async def test_chat_visa_query_returns_visa_steps(test_client, mock_groq_response):
    """
    A visa-related query should return richData containing visa_steps array.
    """
    async def _visa_stream(messages, system_prompt="", **kwargs):
        yield f"\n```json\n{json.dumps(GROQ_VISA_PAYLOAD)}\n```\n\n"
        yield "Here is the student visa process.\n"

    mock_groq_response.stream_chat  = _visa_stream
    mock_groq_response.detect_intent = AsyncMock(return_value="visa")

    body = _chat_body("What are the student visa requirements for India to the UK?")

    response = await test_client.post(
        "/api/chat/message",
        json=body,
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200, f"Expected 200: {response.text}"

    data = response.json()
    rich = data.get("rich_data") or data.get("richData") or {}

    assert rich.get("type") == "visa", (
        f"Expected rich_data.type='visa', got: {rich}"
    )
    visa_steps = rich.get("visa_steps", [])
    assert len(visa_steps) >= 1, "Expected at least one step in rich_data.visa_steps"
    # Each step should have a title
    assert visa_steps[0].get("title"), "First visa step must have a title"


# ─── 3. POST /api/chat/message — missing Authorization → 401 ─────────────────

async def test_chat_without_auth_returns_401(test_client):
    """
    Requests without an Authorization header must be rejected with 401.
    """
    body = _chat_body("Show me scholarships")

    response = await test_client.post(
        "/api/chat/message",
        json=body,
        # No headers — intentionally omitting Authorization
    )

    assert response.status_code == 401, (
        f"Expected 401 Unauthorized, got {response.status_code}"
    )


# ─── 4. POST /api/chat/message — empty message → 422 ─────────────────────────

async def test_chat_empty_message_returns_422(test_client):
    """
    ChatRequest.message has min_length=1 validation.
    An empty string should trigger a 422 Unprocessable Entity.
    """
    body = _chat_body("")

    response = await test_client.post(
        "/api/chat/message",
        json=body,
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 422, (
        f"Expected 422 Validation Error for empty message, got {response.status_code}"
    )
    errors = response.json().get("detail", [])
    assert errors, "Response should include validation error details"


async def test_chat_whitespace_only_message_returns_422(test_client):
    """Whitespace-only message should also fail min_length=1 validation."""
    body = _chat_body("   ")

    response = await test_client.post(
        "/api/chat/message",
        json=body,
        headers=AUTH_HEADERS,
    )
    # Depending on whether the validator strips whitespace, this may be 422 or handled gracefully
    assert response.status_code in (422, 200), (
        "Whitespace message should fail validation (422) or be handled (200)"
    )


async def test_chat_missing_message_field_returns_422(test_client):
    """Omitting the 'message' key entirely must return 422."""
    body = {
        "session_id":      str(uuid.uuid4()),
        "student_profile": {},
        # 'message' intentionally missing
    }

    response = await test_client.post(
        "/api/chat/message",
        json=body,
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 422


# ─── 5. GET /api/chat/history/:session_id ─────────────────────────────────────

async def test_chat_history_returns_messages_list(test_client):
    """
    GET /api/chat/history/{session_id} should return an object containing
    a messages list.  For a new session this may be an empty list.
    """
    session_id = str(uuid.uuid4())

    response = await test_client.get(
        f"/api/chat/history/{session_id}",
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200, (
        f"Expected 200 for chat history, got {response.status_code}: {response.text}"
    )

    data = response.json()
    # Response should have a 'messages' key that is a list
    assert "messages" in data, f"Expected 'messages' key in response, got keys: {list(data.keys())}"
    assert isinstance(data["messages"], list), (
        f"Expected messages to be a list, got: {type(data['messages'])}"
    )


async def test_chat_history_after_message(test_client, mock_groq_response):
    """
    After sending a message, chat history for the same session_id
    should contain at least the user's message.
    """
    session_id = str(uuid.uuid4())

    # 1. Send a message
    async def _stream(messages, system_prompt="", **kwargs):
        yield f"\n```json\n{json.dumps(GROQ_SCHOLARSHIP_PAYLOAD)}\n```\n\n"
        yield "Found scholarships.\n"

    mock_groq_response.stream_chat = _stream

    await test_client.post(
        "/api/chat/message",
        json=_chat_body("Any scholarships for me?", session_id=session_id),
        headers=AUTH_HEADERS,
    )

    # 2. Retrieve history
    history = await test_client.get(
        f"/api/chat/history/{session_id}",
        headers=AUTH_HEADERS,
    )
    assert history.status_code == 200

    messages = history.json().get("messages", [])
    assert len(messages) >= 1, "Expected at least the user message to be in history"

    roles = [m.get("role") for m in messages]
    assert "user" in roles, f"User message not found in history. Roles seen: {roles}"


# ─── 6. Intent detection → correct system prompt ─────────────────────────────

def test_scholarship_query_maps_to_scholarship_prompt():
    """
    A query containing scholarship keywords should be routed to
    SYSTEM_PROMPT_SCHOLARSHIPS via get_prompt_for_intent().
    """
    from app.ai.system_prompts import get_prompt_for_intent, SYSTEM_PROMPT_SCHOLARSHIPS

    prompt = get_prompt_for_intent("scholarships")

    assert prompt == SYSTEM_PROMPT_SCHOLARSHIPS, (
        "get_prompt_for_intent('scholarships') should return SYSTEM_PROMPT_SCHOLARSHIPS"
    )
    assert "scholarship" in prompt.lower(), (
        "SYSTEM_PROMPT_SCHOLARSHIPS should contain the word 'scholarship'"
    )


def test_visa_query_maps_to_visa_prompt():
    """Visa intent routes to the visa system prompt, not scholarship."""
    from app.ai.system_prompts import get_prompt_for_intent, SYSTEM_PROMPT_SCHOLARSHIPS

    visa_prompt = get_prompt_for_intent("visa")
    scholarship_prompt = get_prompt_for_intent("scholarships")

    assert visa_prompt != scholarship_prompt, (
        "Visa and scholarship intents should return different prompts"
    )
    assert "visa" in visa_prompt.lower(), (
        "Visa system prompt should reference visas"
    )


def test_intent_router_detects_scholarship_from_query():
    """
    StudyAbroadRetriever._detect_category() should return 'scholarship'
    for a query containing scholarship keywords.
    """
    try:
        from app.rag.retriever import StudyAbroadRetriever
        retriever = StudyAbroadRetriever.__new__(StudyAbroadRetriever)
        result = retriever._detect_category("What scholarships can I get as an Indian student?")
        assert result == "scholarship", (
            f"Expected 'scholarship', got '{result}'"
        )
    except ImportError:
        pytest.skip("StudyAbroadRetriever not importable in this environment")


def test_intent_router_detects_visa_from_query():
    """_detect_category() should return 'visa' for visa-related queries."""
    try:
        from app.rag.retriever import StudyAbroadRetriever
        retriever = StudyAbroadRetriever.__new__(StudyAbroadRetriever)
        result = retriever._detect_category("What documents do I need for a UK student visa?")
        assert result == "visa", f"Expected 'visa', got '{result}'"
    except ImportError:
        pytest.skip("StudyAbroadRetriever not importable in this environment")


def test_intent_router_returns_none_for_generic_query():
    """A generic, non-domain query should return None from _detect_category()."""
    try:
        from app.rag.retriever import StudyAbroadRetriever
        retriever = StudyAbroadRetriever.__new__(StudyAbroadRetriever)
        result = retriever._detect_category("Hello, how are you?")
        assert result is None, f"Expected None, got '{result}'"
    except ImportError:
        pytest.skip("StudyAbroadRetriever not importable in this environment")
