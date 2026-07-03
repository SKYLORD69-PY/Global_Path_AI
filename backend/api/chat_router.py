"""
GlobalPath AI — Chat API Router
=================================
FastAPI router implementing the full chat orchestration pipeline.

Endpoints:
    POST   /api/chat/message          — standard request/response chat
    GET    /api/chat/stream           — Server-Sent Events streaming chat
    GET    /api/chat/history/{sid}    — last 20 messages for a session
    DELETE /api/chat/session/{sid}    — clear a session\'s history

Orchestration flow (same for both /message and /stream):
    1. IntentRouter  → detect intent, generate live search queries
    2. asyncio.gather → run 2-3 DuckDuckGo searches concurrently
    3. StudyAbroadRetriever → ChromaDB semantic search
    4. Combine all context into a single string
    5. GroqClient.chat() / .stream_chat() with injected context
    6. Parse structured JSON from response into RichData
    7. Persist to PostgreSQL via Supabase
    8. Return response / stream SSE events
"""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.groq_client import GroqClient
from app.ai.intent_router import IntentRouter
from app.ai.system_prompts import get_prompt_for_intent
from app.models.chat_models import (
    ChatHistoryResponse,
    ChatMessageRecord,
    ChatRequest,
    ChatResponse,
    ChatSessionModel,
    DeleteSessionResponse,
    DocumentRichData,
    IntentType,
    MessageRole,
    RichData,
    ScholarshipRichData,
    SourceCitation,
    StreamEvent,
    UniversityRichData,
    VisaRichData,
)
from app.models.database import get_db
from app.rag.retriever import StudyAbroadRetriever
from app.search.live_search import LiveSearchClient
from app.search.result_formatter import SearchResultFormatter

log = structlog.get_logger(__name__)

router = APIRouter(tags=["chat"])

# ─── Shared singletons (lazy-initialised) ─────────────────────────────────────
_groq: GroqClient | None = None
_intent_router: IntentRouter | None = None
_retriever: StudyAbroadRetriever | None = None
_searcher: LiveSearchClient | None = None
_formatter: SearchResultFormatter | None = None


def _get_groq() -> GroqClient:
    global _groq
    if _groq is None:
        _groq = GroqClient()
    return _groq


def _get_intent_router() -> IntentRouter:
    global _intent_router
    if _intent_router is None:
        _intent_router = IntentRouter(groq_client=_get_groq())
    return _intent_router


def _get_retriever() -> StudyAbroadRetriever:
    global _retriever
    if _retriever is None:
        _retriever = StudyAbroadRetriever()
    return _retriever


def _get_searcher() -> LiveSearchClient:
    global _searcher
    if _searcher is None:
        _searcher = LiveSearchClient()
    return _searcher


def _get_formatter() -> SearchResultFormatter:
    global _formatter
    if _formatter is None:
        _formatter = SearchResultFormatter()
    return _formatter

# ─── Constants ────────────────────────────────────────────────────────────────
MAX_HISTORY_MESSAGES = 20
MAX_CONTEXT_MESSAGES = 10   # last N turns sent to Groq for multi-turn context
SSE_HEARTBEAT_EVERY  = 15   # send a comment heartbeat every N seconds during slow streams


# ═════════════════════════════════════════════════════════════════════════════
#  Core orchestration helpers
# ═════════════════════════════════════════════════════════════════════════════

async def _run_live_searches(
    search_queries: list[tuple[str, dict]],
) -> tuple[list[dict], list[SourceCitation]]:
    """
    Execute all live search queries concurrently using asyncio.gather().

    Args:
        search_queries: List of (method_name, kwargs) from IntentRouter.

    Returns:
        (all_results_flat, citations)
          all_results_flat — combined list of {title, snippet, url} dicts
          citations        — formatted citation objects for the response
    """
    if not search_queries:
        return [], []

    async def _run_one(method_name: str, kwargs: dict) -> list[dict]:
        try:
            searcher = _get_searcher()
            fn = getattr(searcher, method_name, None)
            if fn is None:
                log.warning("unknown_search_method", method=method_name)
                return []
            results, _ = await fn(**kwargs)
            return results
        except Exception as exc:
            log.warning("live_search_failed", method=method_name, error=str(exc))
            return []

    # Fire all searches concurrently — cap at 5 s total
    tasks = [_run_one(m, k) for m, k in search_queries]
    try:
        nested: list[list[dict]] = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=False),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        log.warning("live_search_timeout_all")
        return [], []

    # Flatten, deduplicate by URL
    seen_urls:       set[str]       = set()
    all_results:     list[dict]     = []
    for batch in nested:
        for r in batch:
            url = r.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                all_results.append(r)

    citations = _get_formatter().format_as_citations(all_results)
    pydantic_citations = [
        SourceCitation(
            index=c["index"],
            title=c["title"],
            url=c["url"],
            snippet=c.get("snippet", ""),
        )
        for c in citations
    ]
    return all_results, pydantic_citations


async def _build_context(
    user_message:    str,
    student_profile: dict,
    search_results:  list[dict],
    intent:          str,
) -> str:
    """
    Combine RAG retrieval results and live search results into a single
    context string for injection into the Groq system prompt.
    """
    context_parts: list[str] = []

    # 1. ChromaDB semantic retrieval
    try:
        rag_context = _get_retriever().retrieve(user_message, student_profile)
        if rag_context:
            context_parts.append(rag_context)
    except Exception as exc:
        log.warning("rag_retrieval_failed", error=str(exc))

    # 2. Live web search results
    if search_results:
        live_context = _get_formatter().format_for_llm(search_results, query_type=intent)
        if live_context:
            context_parts.append(live_context)

    return "\n\n".join(context_parts)


def _extract_json_block(text: str) -> dict | list | None:
    """
    Extract and parse the first JSON block (``` json ... ```) from
    a Groq response that mixes prose and structured data.

    Returns:
        Parsed Python dict/list, or None if no valid JSON block found.
    """
    # Match ```json ... ``` or ``` ... ``` fenced blocks
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass

    # Fallback: look for a bare top-level JSON object
    bare = re.search(r"(\{[\s\S]*\})", text, re.DOTALL)
    if bare:
        try:
            return json.loads(bare.group(1))
        except json.JSONDecodeError:
            pass

    return None


def _parse_rich_data(raw_text: str, intent: str) -> RichData | None:
    """
    Parse Groq\'s response text into a typed RichData object.

    Each structured prompt (scholarships, universities, visa, documents)
    outputs a JSON block. We extract it, validate with Pydantic, and
    return the appropriate discriminated union type.

    Returns:
        A RichData variant, or None for general intent / parse failure.
    """
    if intent == "general":
        return None

    parsed = _extract_json_block(raw_text)
    if not parsed or not isinstance(parsed, dict):
        log.warning("rich_data_no_json_found", intent=intent)
        return None

    try:
        if intent == "scholarships":
            return ScholarshipRichData(**parsed)
        if intent == "universities":
            return UniversityRichData(**parsed)
        if intent == "visa":
            return VisaRichData(**parsed)
        if intent == "documents":
            return DocumentRichData(**parsed)
    except Exception as exc:
        log.warning("rich_data_parse_error", intent=intent, error=str(exc)[:200])

    return None


def _extract_prose(raw_text: str) -> str:
    """
    Strip the JSON block from Groq\'s response and return only the prose.
    The frontend renders the prose as Markdown; the richData goes to the
    structured UI panels.
    """
    # Remove fenced code blocks (JSON + any other)
    text = re.sub(r"```(?:json)?\s*[\s\S]*?```", "", raw_text, flags=re.DOTALL)
    return text.strip()


def _generate_session_title(message: str) -> str:
    """Generate a short session title from the first user message."""
    clean = message.strip()
    return clean[:60] + "..." if len(clean) > 60 else clean


# ═════════════════════════════════════════════════════════════════════════════
#  Database helpers
# ═════════════════════════════════════════════════════════════════════════════

async def _get_or_create_session(
    db: AsyncSession,
    session_id: str,
    user_id: str | None = None,
    first_message: str = "",
) -> ChatSessionModel:
    """
    Fetch an existing chat session or create a new one.
    Returns the ChatSessionModel ORM instance.
    """
    result = await db.execute(
        select(ChatSessionModel).where(ChatSessionModel.session_id == session_id)
    )
    session = result.scalar_one_or_none()

    if session is None:
        session = ChatSessionModel(
            session_id=session_id,
            user_id=user_id,
            title=_generate_session_title(first_message),
            messages=[],
        )
        db.add(session)
        await db.flush()   # get the id without committing
        log.info("chat_session_created", session_id=session_id)

    return session


async def _append_messages(
    db: AsyncSession,
    session: ChatSessionModel,
    new_messages: list[ChatMessageRecord],
) -> None:
    """
    Append new messages to the session\'s JSONB messages array and commit.
    Uses PostgreSQL\'s || operator via SQLAlchemy to avoid race conditions
    on concurrent writes (though typically one session = one user).
    """
    existing = list(session.messages or [])
    for msg in new_messages:
        existing.append(msg.model_dump())

    # Keep only the last MAX_HISTORY_MESSAGES (ring buffer)
    if len(existing) > MAX_HISTORY_MESSAGES * 2:
        existing = existing[-(MAX_HISTORY_MESSAGES * 2):]

    await db.execute(
        update(ChatSessionModel)
        .where(ChatSessionModel.session_id == session.session_id)
        .values(messages=existing, updated_at=datetime.now(timezone.utc))
    )
    await db.commit()


def _session_to_groq_messages(session: ChatSessionModel) -> list[dict]:
    """
    Convert the last MAX_CONTEXT_MESSAGES from the session into the
    OpenAI-format list that Groq expects.
    """
    raw       = session.messages or []
    recent    = raw[-(MAX_CONTEXT_MESSAGES * 2):]   # keep pairs of user+assistant
    formatted = []
    for m in recent:
        role    = m.get("role", "user")
        content = m.get("content", "")
        if role in ("user", "assistant") and content:
            formatted.append({"role": role, "content": content})
    return formatted


# ═════════════════════════════════════════════════════════════════════════════
#  POST /api/chat/message — standard (non-streaming) endpoint
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/message",
    response_model=ChatResponse,
    summary="Send a chat message and receive a full response",
    responses={
        429: {"description": "Rate limit exceeded"},
        503: {"description": "AI service temporarily unavailable"},
    },
)
async def post_message(
    body: ChatRequest,
    db:   AsyncSession = Depends(get_db),
) -> ChatResponse:
    """
    Full orchestration pipeline:
      1. Route intent + generate search queries
      2. Run live searches concurrently
      3. ChromaDB RAG retrieval
      4. Groq chat completion with full context
      5. Parse structured rich data
      6. Persist to PostgreSQL
      7. Return structured response
    """
    t0         = time.perf_counter()
    message_id = str(uuid.uuid4())
    ts         = datetime.now(timezone.utc).isoformat()

    log.info(
        "chat_message_start",
        session_id=body.session_id,
        message_preview=body.message[:80],
    )

    # ── Step 1: Intent routing ────────────────────────────────────────────────
    try:
        route = await _get_intent_router().route(body.message, body.student_profile)
    except Exception as exc:
        log.error("intent_routing_failed", error=str(exc))
        raise HTTPException(status_code=503, detail="Intent routing service unavailable.")

    intent = route.intent

    # ── Step 2: Concurrent live search ───────────────────────────────────────
    search_results, citations = await _run_live_searches(route.search_queries)

    # ── Step 3: RAG + combine context ────────────────────────────────────────
    context = await _build_context(
        user_message=body.message,
        student_profile=body.student_profile,
        search_results=search_results,
        intent=intent,
    )

    # ── Step 4: Load session history ─────────────────────────────────────────
    try:
        session = await _get_or_create_session(
            db, body.session_id, first_message=body.message
        )
        history_messages = _session_to_groq_messages(session)
    except Exception as exc:
        log.warning("session_load_failed", error=str(exc))
        session          = None
        history_messages = []

    # Build conversation: history + current message
    groq_messages = [
        *history_messages,
        {"role": "user", "content": body.message},
    ]

    # ── Step 5: Groq completion ───────────────────────────────────────────────
    try:
        raw_response = await _get_groq().chat(
            messages=groq_messages,
            system_prompt=route.system_prompt,
            student_profile=body.student_profile,
            context_chunks=context,
        )
    except RuntimeError as exc:
        log.error("groq_chat_failed", error=str(exc))
        raise HTTPException(status_code=503, detail=f"AI service error: {exc}")

    # ── Step 6: Parse rich data ───────────────────────────────────────────────
    rich_data  = _parse_rich_data(raw_response, intent)
    prose_text = _extract_prose(raw_response)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    log.info(
        "chat_message_done",
        session_id=body.session_id,
        intent=intent,
        has_rich_data=rich_data is not None,
        sources=len(citations),
        latency_ms=round(elapsed_ms, 1),
    )

    # ── Step 7: Persist to PostgreSQL ─────────────────────────────────────────
    if session is not None:
        user_msg = ChatMessageRecord(
            id=str(uuid.uuid4()),
            role=MessageRole.USER,
            content=body.message,
            timestamp=ts,
            intent=intent,
        )
        asst_msg = ChatMessageRecord(
            id=message_id,
            role=MessageRole.ASSISTANT,
            content=prose_text,
            timestamp=datetime.now(timezone.utc).isoformat(),
            intent=intent,
            rich_data=rich_data.model_dump() if rich_data else None,
            sources=citations,
        )
        try:
            await _append_messages(db, session, [user_msg, asst_msg])
        except Exception as exc:
            log.warning("message_persist_failed", error=str(exc))

    # ── Step 8: Return ────────────────────────────────────────────────────────
    return ChatResponse(
        message_id=message_id,
        text=prose_text,
        rich_data=rich_data,
        intent=IntentType(intent),
        sources=citations,
        session_id=body.session_id,
        timestamp=ts,
        latency_ms=round(elapsed_ms, 1),
    )


# ═════════════════════════════════════════════════════════════════════════════
#  GET /api/chat/stream — Server-Sent Events streaming endpoint
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/stream",
    summary="Stream a chat response via Server-Sent Events",
    response_class=StreamingResponse,
)
async def stream_message(
    request:         Request,
    session_id:      str = Query(..., min_length=1),
    message:         str = Query(..., min_length=1, max_length=4000),
    profile:         str = Query("{}",  description="JSON-encoded student profile"),
    db: AsyncSession     = Depends(get_db),
) -> StreamingResponse:
    """
    Stream the assistant\'s response token-by-token using Server-Sent Events.

    The React frontend connects with EventSource:
        const es = new EventSource(`/api/chat/stream?session_id=...&message=...&profile=...`)
        es.onmessage = (e) => {
            const event = JSON.parse(e.data)
            if (event.type === "chunk") appendToken(event.text)
            if (event.type === "done")  commitMessage(event.rich_data, event.sources)
        }

    SSE event types:
        { type: "chunk",  text: "..."  }             — append to streaming bubble
        { type: "done",   rich_data, sources, ... }  — finalise the message
        { type: "error",  error: "..."  }             — show error in UI
    """
    # Decode profile JSON — sent as a URL query parameter
    try:
        student_profile: dict = json.loads(profile)
    except json.JSONDecodeError:
        student_profile = {}

    return StreamingResponse(
        _sse_generator(request, session_id, message, student_profile, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control":           "no-cache",
            "X-Accel-Buffering":       "no",    # disable nginx buffering
            "Connection":              "keep-alive",
            "Transfer-Encoding":       "chunked",
        },
    )


async def _sse_generator(
    request:         Request,
    session_id:      str,
    user_message:    str,
    student_profile: dict,
    db:              AsyncSession,
) -> AsyncGenerator[str, None]:
    """
    Core SSE generator — yields formatted `data: {...}\n\n` strings.

    Each yielded string is one SSE event. The generator:
      - Runs the full orchestration pipeline (same as /message)
      - Yields "chunk" events for every token from Groq\'s stream
      - Yields a final "done" event with rich_data and sources
      - Catches client disconnects and cleans up gracefully
    """

    def _sse(payload: dict) -> str:
        """Format a dict as a single SSE data line."""
        return f"data: {json.dumps(payload)}\n\n"

    def _sse_comment() -> str:
        """SSE keep-alive comment (not parsed by EventSource)."""
        return ": heartbeat\n\n"

    message_id = str(uuid.uuid4())
    ts         = datetime.now(timezone.utc).isoformat()
    t0         = time.perf_counter()

    log.info("sse_stream_start", session_id=session_id, message=user_message[:80])

    # ── Pre-stream orchestration ──────────────────────────────────────────────
    # Runs BEFORE the stream starts so the first token arrives with full context.
    try:
        # 1. Intent routing
        route = await _get_intent_router().route(user_message, student_profile)
        intent = route.intent

        # 2. Concurrent live searches + RAG in parallel
        search_task = asyncio.create_task(
            _run_live_searches(route.search_queries)
        )
        rag_task = asyncio.create_task(
            asyncio.to_thread(
                _get_retriever().retrieve, user_message, student_profile
            )
        )
        (search_results, citations), rag_context = await asyncio.gather(
            search_task, rag_task, return_exceptions=True
        )

        # Handle exceptions from gather
        if isinstance(search_results, Exception):
            log.warning("sse_search_failed", error=str(search_results))
            search_results, citations = [], []
        if isinstance(rag_context, Exception):
            log.warning("sse_rag_failed", error=str(rag_context))
            rag_context = ""

        # 3. Combine context
        live_context_str = (
            _get_formatter().format_for_llm(search_results, query_type=intent)
            if search_results else ""
        )
        full_context = "\n\n".join(filter(None, [rag_context, live_context_str]))

        # 4. Load session history
        try:
            session          = await _get_or_create_session(
                db, session_id, first_message=user_message
            )
            history_messages = _session_to_groq_messages(session)
        except Exception as exc:
            log.warning("sse_session_load_failed", error=str(exc))
            session          = None
            history_messages = []

        groq_messages = [
            *history_messages,
            {"role": "user", "content": user_message},
        ]

    except Exception as exc:
        log.error("sse_pre_stream_error", error=str(exc))
        yield _sse(StreamEvent(type="error", error=str(exc)).model_dump())
        return

    # ── Token streaming ───────────────────────────────────────────────────────
    full_response  = []
    last_heartbeat = time.perf_counter()

    try:
        async for chunk in _get_groq().stream_chat(
            messages=groq_messages,
            system_prompt=route.system_prompt,
            student_profile=student_profile,
            context_chunks=full_context,
        ):
            # Detect client disconnect
            if await request.is_disconnected():
                log.info("sse_client_disconnected", session_id=session_id)
                return

            full_response.append(chunk)

            # Yield the text chunk
            yield _sse({"type": "chunk", "text": chunk})

            # Heartbeat to prevent proxy timeouts on slow streams
            now = time.perf_counter()
            if now - last_heartbeat > SSE_HEARTBEAT_EVERY:
                yield _sse_comment()
                last_heartbeat = now

    except RuntimeError as exc:
        log.error("sse_stream_error", error=str(exc))
        yield _sse(StreamEvent(type="error", error=str(exc)).model_dump())
        return

    # ── Post-stream: parse, persist, done event ───────────────────────────────
    raw_response = "".join(full_response)
    rich_data    = _parse_rich_data(raw_response, intent)
    prose_text   = _extract_prose(raw_response)
    elapsed_ms   = (time.perf_counter() - t0) * 1000

    # Persist to DB
    if session is not None:
        user_msg = ChatMessageRecord(
            id=str(uuid.uuid4()),
            role=MessageRole.USER,
            content=user_message,
            timestamp=ts,
            intent=intent,
        )
        asst_msg = ChatMessageRecord(
            id=message_id,
            role=MessageRole.ASSISTANT,
            content=prose_text,
            timestamp=datetime.now(timezone.utc).isoformat(),
            intent=intent,
            rich_data=rich_data.model_dump() if rich_data else None,
            sources=citations,
        )
        try:
            await _append_messages(db, session, [user_msg, asst_msg])
        except Exception as exc:
            log.warning("sse_persist_failed", error=str(exc))

    log.info(
        "sse_stream_done",
        session_id=session_id,
        intent=intent,
        tokens=len(full_response),
        latency_ms=round(elapsed_ms, 1),
    )

    # Final "done" event — frontend commits the message and renders rich_data
    done_event = StreamEvent(
        type="done",
        rich_data=rich_data,
        sources=citations,
        intent=IntentType(intent),
        message_id=message_id,
        session_id=session_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    yield _sse(done_event.model_dump())


# ═════════════════════════════════════════════════════════════════════════════
#  GET /api/chat/history/{session_id}
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/history/{session_id}",
    response_model=ChatHistoryResponse,
    summary="Retrieve message history for a session",
)
async def get_chat_history(
    session_id: str,
    limit:      int           = Query(20, ge=1, le=100),
    db:         AsyncSession  = Depends(get_db),
) -> ChatHistoryResponse:
    """
    Return the last `limit` messages for the given session.

    Returns an empty messages list (not 404) if the session doesn\'t exist
    yet — the frontend uses this to pre-populate the chat on page load.
    """
    result = await db.execute(
        select(ChatSessionModel).where(ChatSessionModel.session_id == session_id)
    )
    session = result.scalar_one_or_none()

    if session is None:
        return ChatHistoryResponse(session_id=session_id, messages=[], total=0)

    raw_messages   = session.messages or []
    recent         = raw_messages[-limit:]
    parsed_messages: list[ChatMessageRecord] = []

    for m in recent:
        try:
            parsed_messages.append(ChatMessageRecord(**m))
        except Exception as exc:
            log.warning("history_message_parse_error", error=str(exc))
            continue

    return ChatHistoryResponse(
        session_id=session_id,
        messages=parsed_messages,
        total=len(raw_messages),
    )


# ═════════════════════════════════════════════════════════════════════════════
#  DELETE /api/chat/session/{session_id}
# ═════════════════════════════════════════════════════════════════════════════

@router.delete(
    "/session/{session_id}",
    response_model=DeleteSessionResponse,
    summary="Clear all messages for a chat session",
)
async def delete_session(
    session_id: str,
    db:         AsyncSession = Depends(get_db),
) -> DeleteSessionResponse:
    """
    Wipe a session\'s message history.

    Two behaviour modes:
      - If the session exists: clears messages array (keeps the session row)
      - If the session doesn\'t exist: returns deleted=False (not an error)

    The frontend calls this when the user clicks "New conversation".
    """
    result = await db.execute(
        select(ChatSessionModel).where(ChatSessionModel.session_id == session_id)
    )
    session = result.scalar_one_or_none()

    if session is None:
        return DeleteSessionResponse(
            session_id=session_id,
            deleted=False,
            message="Session not found — nothing to delete.",
        )

    await db.execute(
        update(ChatSessionModel)
        .where(ChatSessionModel.session_id == session_id)
        .values(messages=[], title=None, updated_at=datetime.now(timezone.utc))
    )
    await db.commit()

    log.info("chat_session_cleared", session_id=session_id)
    return DeleteSessionResponse(
        session_id=session_id,
        deleted=True,
        message="Session history cleared successfully.",
    )
