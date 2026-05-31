"""
GlobalPath AI — Groq Client
==============================
Wraps the Groq Python SDK for both standard and streaming chat completions
using the llama-3.3-70b-versatile model (free tier at console.groq.com).

Key features:
  - chat()        : async, returns full response text after completion
  - stream_chat() : async generator, yields text tokens as they arrive
  - Both methods inject student_profile and RAG context as XML blocks
  - Exponential backoff on Groq rate-limit errors (30 req/min free tier)
  - Logs token usage after every call
  - detect_intent() : classifies user message into one of 5 categories

Get your free API key: https://console.groq.com
Install: pip install groq

Usage:
    client = GroqClient()

    # Standard (waits for full response):
    text = await client.chat(
        messages       = [{"role": "user", "content": "What scholarships suit me?"}],
        system_prompt  = SYSTEM_PROMPT_SCHOLARSHIPS,
        student_profile = {...},
        context_chunks  = "...retrieved RAG context...",
    )

    # Streaming (yields chunks for real-time UI):
    async for chunk in client.stream_chat(messages, system_prompt, profile, context):
        print(chunk, end="", flush=True)
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any, AsyncGenerator

import structlog
from groq import AsyncGroq, RateLimitError, APIStatusError, APIConnectionError
from dotenv import load_dotenv

load_dotenv()

log = structlog.get_logger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

MODEL_ID           = "llama-3.3-70b-versatile"
MAX_TOKENS         = 4096
TEMPERATURE        = 0.35    # low = more factual, less creative (good for advisors)
TOP_P              = 0.9
MAX_RETRIES        = 4
BACKOFF_BASE_S     = 2.0     # first retry waits 2s, then 4s, 8s, 16s
RATE_LIMIT_WAIT_S  = 62.0    # Groq resets the rate-limit window every 60 seconds


# ─── Profile formatter ────────────────────────────────────────────────────────

def _format_student_profile_xml(profile: dict[str, Any] | None) -> str:
    """
    Serialise the Zustand student profile dict into a structured XML block
    that the LLM can parse unambiguously.

    Args:
        profile: Zustand student profile dict from the frontend.

    Returns:
        XML string block, or an empty <student_profile/> tag if no profile.
    """
    if not profile:
        return "<student_profile>No profile provided.</student_profile>"

    def _safe(val: Any) -> str:
        if val is None or val == "":
            return "Not specified"
        if isinstance(val, list):
            return ", ".join(str(v) for v in val) if val else "Not specified"
        if isinstance(val, dict):
            return "; ".join(f"{k}: {v}" for k, v in val.items() if v)
        return str(val)

    # Language tests: [{testName, score}]
    lang_tests_raw = profile.get("languageTests", [])
    lang_tests_str = (
        "; ".join(f"{t.get('testName', 'Unknown')}: {t.get('score', 'N/A')}" for t in lang_tests_raw)
        if lang_tests_raw else "Not yet taken"
    )

    # GMAT/GRE: {test, score, date}
    gmat_gre_raw = profile.get("gmatGre", {})
    gmat_gre_str = (
        f"{gmat_gre_raw.get('test', 'N/A')}: {gmat_gre_raw.get('score', 'N/A')}"
        if gmat_gre_raw and gmat_gre_raw.get("score") else "Not taken"
    )

    budget_min = profile.get("budgetMin", 0)
    budget_max = profile.get("budgetMax", 0)
    budget_str = f"USD {budget_min:,} – USD {budget_max:,} per year"

    return f"""<student_profile>
  <home_country>{_safe(profile.get("homeCountry"))}</home_country>
  <nationality>{_safe(profile.get("nationality"))}</nationality>
  <current_education_level>{_safe(profile.get("currentEducationLevel"))}</current_education_level>
  <target_degree>{_safe(profile.get("targetDegree"))}</target_degree>
  <field_of_study>{_safe(profile.get("fieldOfStudy"))}</field_of_study>
  <target_countries>{_safe(profile.get("targetCountries"))}</target_countries>
  <annual_budget>{budget_str}</annual_budget>
  <language_test_scores>{lang_tests_str}</language_test_scores>
  <gmat_gre>{gmat_gre_str}</gmat_gre>
  <intake_year>{_safe(profile.get("intakeYear"))}</intake_year>
  <intake_semester>{_safe(profile.get("intakeSemester"))}</intake_semester>
</student_profile>""".strip()


def _format_context_xml(context_chunks: str | list[str] | None) -> str:
    """
    Wrap RAG retrieval results and live search results in a <context> XML block.

    Args:
        context_chunks: Either a single formatted string (from retriever/formatter)
                        or a list of strings to be joined. None = no context.

    Returns:
        XML string ready for injection into the system prompt.
    """
    if not context_chunks:
        return "<context>No additional context available.</context>"

    if isinstance(context_chunks, list):
        combined = "\n\n".join(str(c) for c in context_chunks if c)
    else:
        combined = str(context_chunks)

    if not combined.strip():
        return "<context>No additional context available.</context>"

    return f"""<context>
{combined.strip()}
</context>""".strip()


def _build_full_system_prompt(
    base_prompt:    str,
    student_profile: dict[str, Any] | None,
    context_chunks:  str | list[str] | None,
) -> str:
    """
    Assemble the final system prompt by injecting the student profile
    and retrieved context below the base prompt instructions.
    """
    profile_xml = _format_student_profile_xml(student_profile)
    context_xml = _format_context_xml(context_chunks)

    return f"""{base_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STUDENT PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{profile_xml}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RETRIEVED KNOWLEDGE & LIVE SEARCH CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{context_xml}
""".strip()


# ─── GroqClient ───────────────────────────────────────────────────────────────

class GroqClient:
    """
    Async Groq API client with RAG context injection, retry logic, and streaming.

    Instantiate once at startup (singleton pattern in FastAPI lifespan) and
    share across request handlers. The AsyncGroq client uses httpx internally
    and is safe to share across async tasks.
    """

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or os.getenv("GROQ_API_KEY", "")
        if not resolved_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. "
                "Get your free key at https://console.groq.com and add it to backend/.env"
            )
        self._client = AsyncGroq(api_key=resolved_key)
        self.log     = structlog.get_logger(component="GroqClient", model=MODEL_ID)

    # ── Standard chat (full response) ────────────────────────────────────────

    async def chat(
        self,
        messages:        list[dict[str, str]],
        system_prompt:   str,
        student_profile: dict[str, Any] | None = None,
        context_chunks:  str | list[str] | None = None,
        temperature:     float                  = TEMPERATURE,
        max_tokens:      int                    = MAX_TOKENS,
    ) -> str:
        """
        Send a chat request to Groq and return the full response text.

        Automatically injects student_profile and context_chunks into the
        system prompt as XML blocks. Retries on rate-limit errors with
        exponential backoff.

        Args:
            messages:        Conversation history in OpenAI format:
                             [{"role": "user"|"assistant", "content": "..."}]
            system_prompt:   One of the prompts from system_prompts.py.
            student_profile: Zustand profile dict (optional but recommended).
            context_chunks:  RAG + live search context string(s).
            temperature:     Sampling temperature (0.0–1.0).
            max_tokens:      Maximum response tokens.

        Returns:
            The assistant's full response text.

        Raises:
            RuntimeError: if all retries are exhausted.
        """
        full_system = _build_full_system_prompt(system_prompt, student_profile, context_chunks)
        groq_messages = [{"role": "system", "content": full_system}, *messages]

        self.log.info(
            "chat_start",
            messages=len(messages),
            system_tokens_approx=len(full_system.split()),
            has_profile=student_profile is not None,
            has_context=bool(context_chunks),
        )

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                t0       = time.perf_counter()
                response = await self._client.chat.completions.create(
                    model=MODEL_ID,
                    messages=groq_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    top_p=TOP_P,
                    stream=False,
                )
                elapsed = time.perf_counter() - t0

                content     = response.choices[0].message.content or ""
                usage       = response.usage
                self._log_usage(usage, elapsed)
                return content

            except RateLimitError as exc:
                wait = RATE_LIMIT_WAIT_S if attempt == 1 else BACKOFF_BASE_S * (2 ** attempt)
                self.log.warning(
                    "rate_limit_hit",
                    attempt=attempt,
                    wait_s=wait,
                    error=str(exc)[:120],
                )
                if attempt >= MAX_RETRIES:
                    raise RuntimeError(f"Groq rate limit exceeded after {MAX_RETRIES} retries.") from exc
                await asyncio.sleep(wait)

            except APIConnectionError as exc:
                wait = BACKOFF_BASE_S * (2 ** attempt)
                self.log.warning("connection_error", attempt=attempt, wait_s=wait, error=str(exc)[:120])
                if attempt >= MAX_RETRIES:
                    raise RuntimeError(f"Groq connection failed after {MAX_RETRIES} retries.") from exc
                await asyncio.sleep(wait)

            except APIStatusError as exc:
                # 4xx errors (except 429 rate-limit) are not retryable
                self.log.error("api_status_error", status=exc.status_code, body=str(exc)[:200])
                raise RuntimeError(f"Groq API error {exc.status_code}: {exc.message}") from exc

        raise RuntimeError("chat() exhausted all retries without a successful response.")

    # ── Streaming chat ────────────────────────────────────────────────────────

    async def stream_chat(
        self,
        messages:        list[dict[str, str]],
        system_prompt:   str,
        student_profile: dict[str, Any] | None = None,
        context_chunks:  str | list[str] | None = None,
        temperature:     float                  = TEMPERATURE,
        max_tokens:      int                    = MAX_TOKENS,
    ) -> AsyncGenerator[str, None]:
        """
        Stream a Groq chat completion as an async generator of text chunks.

        Yields each text token as it arrives from the API — connect this
        directly to a FastAPI StreamingResponse or SSE endpoint for
        real-time chat UI.

        Args:
            Same as chat().

        Yields:
            str: Individual text tokens/chunks from the stream.

        Raises:
            RuntimeError: on rate-limit exhaustion or connection failure.
        """
        full_system = _build_full_system_prompt(system_prompt, student_profile, context_chunks)
        groq_messages = [{"role": "system", "content": full_system}, *messages]

        self.log.info(
            "stream_chat_start",
            messages=len(messages),
            has_profile=student_profile is not None,
            has_context=bool(context_chunks),
        )

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                t0              = time.perf_counter()
                total_tokens    = 0
                chunks_yielded  = 0

                async with self._client.chat.completions.stream(
                    model=MODEL_ID,
                    messages=groq_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    top_p=TOP_P,
                ) as stream:
                    async for chunk in stream:
                        delta = chunk.choices[0].delta.content
                        if delta:
                            total_tokens   += 1
                            chunks_yielded += 1
                            yield delta

                elapsed = time.perf_counter() - t0
                self.log.info(
                    "stream_chat_done",
                    chunks_yielded=chunks_yielded,
                    elapsed_s=round(elapsed, 2),
                    tokens_per_s=round(chunks_yielded / elapsed, 1) if elapsed > 0 else 0,
                )
                return   # successful — exit the retry loop

            except RateLimitError as exc:
                wait = RATE_LIMIT_WAIT_S if attempt == 1 else BACKOFF_BASE_S * (2 ** attempt)
                self.log.warning("stream_rate_limit", attempt=attempt, wait_s=wait)
                if attempt >= MAX_RETRIES:
                    raise RuntimeError("Groq rate limit exceeded during streaming.") from exc
                await asyncio.sleep(wait)

            except APIConnectionError as exc:
                wait = BACKOFF_BASE_S * (2 ** attempt)
                self.log.warning("stream_connection_error", attempt=attempt, wait_s=wait)
                if attempt >= MAX_RETRIES:
                    raise RuntimeError("Groq connection failed during streaming.") from exc
                await asyncio.sleep(wait)

            except APIStatusError as exc:
                self.log.error("stream_api_status_error", status=exc.status_code)
                raise RuntimeError(f"Groq API error {exc.status_code}: {exc.message}") from exc

    # ── Intent detection ─────────────────────────────────────────────────────

    async def detect_intent(self, user_message: str) -> str:
        """
        Classify the user's message into one of 5 intent categories using
        a lightweight Groq call with a minimal prompt.

        Uses a small max_tokens budget (50) so this is fast and cheap.

        Args:
            user_message: The raw user message string.

        Returns:
            One of: "scholarships" | "universities" | "visa" |
                    "documents" | "general"
        """
        if not user_message or not user_message.strip():
            return "general"

        # Fast keyword pre-check before making an API call
        quick_intent = _keyword_intent(user_message)
        if quick_intent != "general":
            self.log.debug("intent_from_keywords", intent=quick_intent, skipped_api=True)
            return quick_intent

        # Fall back to LLM classification for ambiguous queries
        classification_prompt = (
            "You are an intent classifier for a study-abroad advisory chatbot. "
            "Classify the following user message into exactly ONE of these categories:\n"
            "scholarships — funding, grants, financial aid, bursaries, fellowships\n"
            "universities — shortlisting, programs, rankings, admissions, courses\n"
            "visa         — student visa, permit, immigration, travel documents, UKVI\n"
            "documents    — application checklist, transcripts, SOP, references, what do I need\n"
            "general      — anything else: costs, city life, cultural questions, timelines\n\n"
            "Respond with ONLY the single category word. No explanation."
        )

        try:
            response = await self._client.chat.completions.create(
                model=MODEL_ID,
                messages=[
                    {"role": "system", "content": classification_prompt},
                    {"role": "user",   "content": user_message[:500]},
                ],
                temperature=0.0,
                max_tokens=10,
            )
            raw    = (response.choices[0].message.content or "general").strip().lower()
            intent = raw if raw in {"scholarships", "universities", "visa", "documents"} else "general"

            self.log.debug("intent_from_llm", raw=raw, resolved=intent)
            return intent

        except Exception as exc:
            self.log.warning("intent_detection_failed", error=str(exc), fallback="general")
            return "general"

    # ── Logging helpers ───────────────────────────────────────────────────────

    def _log_usage(self, usage: Any, elapsed: float) -> None:
        """Log Groq token usage and cost estimate to console."""
        if usage is None:
            return

        prompt_tokens     = getattr(usage, "prompt_tokens",     0) or 0
        completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        total_tokens      = getattr(usage, "total_tokens",      0) or 0

        # Groq free tier pricing is $0 but we log the equivalent cost for awareness
        # when moving to paid tiers (llama-3.3-70b: ~$0.59/M input, ~$0.79/M output)
        cost_estimate = (prompt_tokens * 0.00000059) + (completion_tokens * 0.00000079)

        self.log.info(
            "groq_usage",
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            elapsed_s=round(elapsed, 2),
            tokens_per_s=round(total_tokens / elapsed, 1) if elapsed > 0 else 0,
            cost_usd_estimate=round(cost_estimate, 6),
        )

        # Also print to stdout so it's visible in development without a log aggregator
        print(
            f"[Groq] {total_tokens} tokens "
            f"({prompt_tokens} in / {completion_tokens} out) | "
            f"{elapsed:.2f}s | ~${cost_estimate:.5f}"
        )


# ─── Keyword-based fast intent detection ─────────────────────────────────────

_SCHOLARSHIP_KW  = frozenset(["scholarship","scholarships","grant","grants","funding",
                               "funded","fellowship","bursary","financial aid","stipend",
                               "award","fund my","pay for","afford"])
_UNIVERSITY_KW   = frozenset(["university","universities","college","program","programme",
                               "course","shortlist","ranking","rankings","admission",
                               "apply","campus","acceptance","enroll","study at"])
_VISA_KW         = frozenset(["visa","permit","immigration","travel document","tier 4",
                               "f-1","f1","student visa","study permit","ukvi","ircc",
                               "embassy","consulate","border","entry clearance"])
_DOCUMENT_KW     = frozenset(["document","documents","checklist","transcript","transcripts",
                               "sop","statement of purpose","reference","references","lor",
                               "certificate","what do i need","what documents","ielts",
                               "toefl","gre","gmat","personal statement"])


def _keyword_intent(message: str) -> str:
    """
    Fast O(n) keyword scan for unambiguous intents.
    Returns "general" if no strong signal is found.
    """
    lower  = message.lower()
    tokens = set(lower.split())

    # Multi-word phrase checks first (more specific)
    if any(phrase in lower for phrase in ["student visa", "study permit", "visa requirement"]):
        return "visa"
    if any(phrase in lower for phrase in ["personal statement", "statement of purpose", "what documents"]):
        return "documents"
    if any(phrase in lower for phrase in ["fully funded", "financial aid", "scholarship"]):
        return "scholarships"

    # Single token checks
    if tokens & _VISA_KW:
        return "visa"
    if tokens & _SCHOLARSHIP_KW:
        return "scholarships"
    if tokens & _DOCUMENT_KW:
        return "documents"
    if tokens & _UNIVERSITY_KW:
        return "universities"
    return "general"
