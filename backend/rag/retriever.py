"""
GlobalPath AI — Study Abroad Retriever
========================================
Combines Embedder + ChromaVectorStore into a single high-level interface
used by the chat service to build RAG context for every LLM call.

The retriever:
  1. Parses the user's query for intent signals (country, category)
  2. Maps those signals to ChromaDB metadata filters for precise retrieval
  3. Fetches top-6 semantically similar chunks
  4. Formats them as a numbered context block ready for prompt injection

Usage:
    retriever = StudyAbroadRetriever()
    context   = retriever.retrieve(
        query           = "What documents do I need for a UK student visa?",
        student_profile = {"targetCountries": ["United Kingdom"], "targetDegree": "masters"},
    )
    # context is a formatted string injected into the Groq prompt
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from .embedder    import Embedder
from .vector_store import ChromaVectorStore

log = structlog.get_logger(__name__)

# ─── Intent detection maps ────────────────────────────────────────────────────

# Keywords that signal a scholarship-related query
_SCHOLARSHIP_KEYWORDS = frozenset([
    "scholarship", "scholarships", "fund", "funding", "grant", "stipend",
    "bursary", "fellowship", "award", "financial aid", "tuition waiver",
    "fully funded", "partial fund",
])

# Keywords that signal a visa-related query
_VISA_KEYWORDS = frozenset([
    "visa", "permit", "immigration", "student visa", "study permit",
    "tier 4", "f-1", "f1", "subclass 500", "national visa",
    "entry clearance", "residence permit",
])

# Keywords that signal a university / program query
_UNIVERSITY_KEYWORDS = frozenset([
    "university", "universities", "college", "program", "programme",
    "course", "degree", "master", "bachelor", "phd", "admission",
    "acceptance", "apply", "application", "ranking", "campus",
])

# Map of country name variations → canonical stored country name
# Keeps the filter matching robust against how users phrase country names
_COUNTRY_ALIASES: dict[str, str] = {
    # United Kingdom
    "uk":              "United Kingdom",
    "u.k.":            "United Kingdom",
    "britain":         "United Kingdom",
    "great britain":   "United Kingdom",
    "england":         "United Kingdom",
    "scotland":        "United Kingdom",
    "wales":           "United Kingdom",
    # United States
    "usa":             "United States",
    "u.s.a.":          "United States",
    "us":              "United States",
    "u.s.":            "United States",
    "america":         "United States",
    "united states":   "United States",
    # Canada
    "canada":          "Canada",
    "canadian":        "Canada",
    # Germany
    "germany":         "Germany",
    "deutschland":     "Germany",
    "german":          "Germany",
    # Australia
    "australia":       "Australia",
    "oz":              "Australia",
    "aussie":          "Australia",
    # New Zealand
    "nz":              "New Zealand",
    "new zealand":     "New Zealand",
    # Common European destinations
    "france":          "France",
    "netherlands":     "Netherlands",
    "holland":         "Netherlands",
    "sweden":          "Sweden",
    "norway":          "Norway",
    "denmark":         "Denmark",
    "ireland":         "Ireland",
    "spain":           "Spain",
    "italy":           "Italy",
    # Asia-Pacific
    "japan":           "Japan",
    "south korea":     "South Korea",
    "singapore":       "Singapore",
    "china":           "China",
}

# How many chunks to retrieve and include in context
DEFAULT_TOP_K       = 8     # retrieved from ChromaDB
CONTEXT_CHUNKS_USED = 6     # included in the final formatted string


# ─── Retriever ────────────────────────────────────────────────────────────────

class StudyAbroadRetriever:
    """
    High-level RAG retriever for the GlobalPath AI chat service.

    Shares a single Embedder and ChromaVectorStore across all calls
    (model is loaded once, then cached in memory).
    """

    def __init__(
        self,
        embedder:     Embedder           | None = None,
        vector_store: ChromaVectorStore  | None = None,
        top_k:        int                       = DEFAULT_TOP_K,
    ) -> None:
        self.embedder     = embedder or Embedder()
        self.vector_store = vector_store or ChromaVectorStore()
        self.top_k        = top_k
        self.log          = structlog.get_logger(component="StudyAbroadRetriever")

    # ── Main retrieve method ───────────────────────────────────────────────────

    def retrieve(
        self,
        query:           str,
        student_profile: dict[str, Any] | None = None,
    ) -> str:
        """
        Retrieve the most relevant knowledge chunks for a user query and
        return them as a formatted context string for LLM prompt injection.

        Intent detection pipeline:
          1. Detect country mentions  → filter by country
          2. Detect category signals  → filter by category (visa/scholarship/university)
          3. Enrich with student profile signals  → add profile target countries as fallback
          4. Query ChromaDB with the resolved filters
          5. Format top-6 results as a numbered context block

        Args:
            query:           The user's raw question.
            student_profile: Zustand student profile dict (optional).
                             Used to enrich country filtering when the query
                             doesn't mention a country explicitly.

        Returns:
            Formatted multi-line string:

                [Context Block 1 — scholarship | United Kingdom]
                Scholarship: Chevening Scholarships
                Provider: UK FCDO
                ...

                [Context Block 2 — visa | Germany]
                Visa Type: Student Visa (National Visa D)
                ...

            Returns an empty string if no relevant chunks are found.
        """
        if not query or not query.strip():
            return ""

        profile = student_profile or {}

        # ── 1. Intent detection ───────────────────────────────────────────────
        detected_countries = self._detect_countries(query)
        detected_category  = self._detect_category(query)

        self.log.info(
            "retrieve_intent",
            query=query[:100],
            countries=detected_countries,
            category=detected_category,
        )

        # ── 2. Enrich with student profile ────────────────────────────────────
        # If no country detected in query, fall back to the student's target countries
        if not detected_countries:
            profile_countries = profile.get("targetCountries", [])
            if profile_countries and isinstance(profile_countries, list):
                # Only use the first profile country for filtering — too many breaks ChromaDB
                detected_countries = [profile_countries[0]]
                self.log.debug(
                    "retrieve_country_from_profile",
                    country=detected_countries[0],
                )

        # ── 3. Build filter dict ──────────────────────────────────────────────
        filter_metadata: dict[str, Any] = {}

        if detected_category:
            filter_metadata["category"] = detected_category

        if detected_countries:
            if len(detected_countries) == 1:
                filter_metadata["country"] = detected_countries[0]
            else:
                filter_metadata["country"] = detected_countries  # triggers $in query

        # ── 4. ChromaDB query ────────────────────────────────────────────────
        results = self.vector_store.query(
            query_text=query,
            embedder=self.embedder,
            top_k=self.top_k,
            filter_metadata=filter_metadata,
        )

        # If filtered query returns fewer than 3 results, retry without filters
        # This prevents the bot from responding with empty context when filters
        # are too restrictive (e.g. user asks about a country with no visa data yet)
        if len(results) < 3 and filter_metadata:
            self.log.info(
                "retrieve_fallback_no_filter",
                filtered_results=len(results),
                reason="too_few_results_with_filter",
            )
            results = self.vector_store.query(
                query_text=query,
                embedder=self.embedder,
                top_k=self.top_k,
                filter_metadata={},
            )

        if not results:
            self.log.info("retrieve_no_results", query=query[:80])
            return ""

        # ── 5. Format context string ─────────────────────────────────────────
        top_results = results[:CONTEXT_CHUNKS_USED]
        context     = self._format_context(top_results)

        self.log.info(
            "retrieve_done",
            chunks_used=len(top_results),
            top_score=top_results[0]["score"] if top_results else None,
        )
        return context

    # ── Intent detection helpers ───────────────────────────────────────────────

    def _detect_countries(self, query: str) -> list[str]:
        """
        Scan the query for country names or aliases.
        Returns a deduplicated list of canonical country names.
        """
        lower    = query.lower()
        found:   list[str] = []
        seen:    set[str]  = set()

        for alias, canonical in _COUNTRY_ALIASES.items():
            # Word-boundary matching to avoid "us" matching "mus" etc.
            pattern = r"\b" + re.escape(alias) + r"\b"
            if re.search(pattern, lower) and canonical not in seen:
                found.append(canonical)
                seen.add(canonical)

        return found

    def _detect_category(self, query: str) -> str | None:
        """
        Detect the primary information category the user is asking about.
        Returns "scholarship", "visa", "university", or None.

        When multiple categories are detected (e.g. "scholarship visa waiver"),
        the order of priority is: visa > scholarship > university.
        """
        lower = query.lower()
        tokens = set(re.findall(r"\b\w+\b", lower))

        # Multi-word phrases take priority
        if any(kw in lower for kw in ["student visa", "visa requirement", "study permit"]):
            return "visa"

        # Single token matching
        has_visa         = bool(tokens & _VISA_KEYWORDS)
        has_scholarship  = bool(tokens & _SCHOLARSHIP_KEYWORDS)
        has_university   = bool(tokens & _UNIVERSITY_KEYWORDS)

        if has_visa:
            return "visa"
        if has_scholarship:
            return "scholarship"
        if has_university:
            return "university"
        return None

    # ── Context formatting ─────────────────────────────────────────────────────

    @staticmethod
    def _format_context(results: list[dict[str, Any]]) -> str:
        """
        Format a list of retrieved chunks into a structured, numbered context
        block suitable for injection into an LLM prompt.

        Format per chunk:
            [Context Block N — {category} | {country}]
            {chunk text}
        """
        if not results:
            return ""

        blocks: list[str] = []
        for i, result in enumerate(results, start=1):
            meta     = result.get("metadata", {})
            category = meta.get("category", "general")
            country  = meta.get("country", "")
            score    = result.get("score", 0.0)
            text     = result.get("text", "").strip()

            # Header line
            header_parts = [f"Context Block {i}"]
            if category:
                header_parts.append(category)
            if country:
                header_parts.append(country)

            header = f"[{' — '.join(header_parts)}]  (relevance: {score:.2f})"

            blocks.append(f"{header}\n{text}")

        return "\n\n".join(blocks)

    # ── Profile-aware shortcut ─────────────────────────────────────────────────

    def retrieve_for_profile(self, student_profile: dict[str, Any]) -> str:
        """
        Generate a summary context about the student's target destinations
        without a specific query — useful for the dashboard overview panel.

        Builds a synthetic query from the profile's key fields so the
        retriever can pull the most relevant onboarding content.

        Args:
            student_profile: Zustand profile object.

        Returns:
            Formatted context string (same format as retrieve()).
        """
        countries    = student_profile.get("targetCountries", [])
        degree       = student_profile.get("targetDegree", "")
        field        = student_profile.get("fieldOfStudy", "")
        budget_max   = student_profile.get("budgetMax", 0)

        query_parts: list[str] = []
        if field:
            query_parts.append(f"{field} programs")
        if degree:
            query_parts.append(f"{degree} degree")
        if countries:
            query_parts.append(f"in {', '.join(countries[:2])}")
        if budget_max:
            query_parts.append(f"budget under USD {budget_max:,}")

        if not query_parts:
            query_parts = ["study abroad international programs scholarships"]

        synthetic_query = " ".join(query_parts)
        self.log.info("retrieve_for_profile", synthetic_query=synthetic_query)

        return self.retrieve(
            query=synthetic_query,
            student_profile=student_profile,
        )
