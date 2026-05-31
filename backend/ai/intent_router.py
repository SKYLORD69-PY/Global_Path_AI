"""
GlobalPath AI — Intent Router
================================
Routes user messages to the correct system prompt, RAG retrieval strategy,
and live search queries based on detected intent.

The router is the central orchestration point for every chat request:
  1. Detect intent from user message
  2. Select the matching system prompt
  3. Generate 2-3 optimised live search queries for the LiveSearchClient
  4. Return everything the chat handler needs to build the full context

Usage:
    router = IntentRouter()
    result = await router.route(
        user_message    = "What scholarships are available for Indian students in Germany?",
        student_profile = {"nationality": "Indian", "targetCountries": ["Germany"], ...},
    )
    # result.intent          → "scholarships"
    # result.system_prompt   → SYSTEM_PROMPT_SCHOLARSHIPS
    # result.search_queries  → [("scholarship", {...}), ...]
    # result.rag_filters     → {"category": "scholarship", "country": "Germany"}
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.ai.system_prompts import get_prompt_for_intent, VALID_INTENTS
from app.ai.groq_client    import GroqClient, _keyword_intent

log = structlog.get_logger(__name__)

# ─── Country alias normalisation (same map as retriever.py) ──────────────────

_COUNTRY_ALIASES: dict[str, str] = {
    "uk":            "United Kingdom",  "u.k.":         "United Kingdom",
    "britain":       "United Kingdom",  "england":      "United Kingdom",
    "usa":           "United States",   "u.s.a.":       "United States",
    "us":            "United States",   "america":      "United States",
    "canada":        "Canada",          "canadian":     "Canada",
    "germany":       "Germany",         "deutsch":      "Germany",
    "german":        "Germany",         "deutschland":  "Germany",
    "australia":     "Australia",       "aussie":       "Australia",
    "new zealand":   "New Zealand",     "nz":           "New Zealand",
    "france":        "France",          "french":       "France",
    "netherlands":   "Netherlands",     "holland":      "Netherlands",
    "sweden":        "Sweden",          "norway":       "Norway",
    "ireland":       "Ireland",         "denmark":      "Denmark",
    "singapore":     "Singapore",       "japan":        "Japan",
    "south korea":   "South Korea",
}

# Degree level normalisation
_DEGREE_LABELS: dict[str, str] = {
    "bachelors": "undergraduate bachelor's",
    "masters":   "master's MSc",
    "phd":       "PhD doctoral",
}


# ─── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class RouteResult:
    """
    Everything the chat handler needs to build a full context-enriched
    Groq request for a given user message.
    """
    intent:        str                           # "scholarships"|"universities"|"visa"|"documents"|"general"
    system_prompt: str                           # full system prompt string
    search_queries: list[tuple[str, dict]]       # [(method_name, kwargs), ...] for LiveSearchClient
    rag_filters:   dict[str, Any]               # ChromaDB where-clause filters
    detected_countries: list[str]               # country names found in the query
    detected_degree:    str                     # "bachelors"|"masters"|"phd"|""
    detected_field:     str                     # field of study if detected
    context_hint:       str                     # human-readable explanation for logging/debug


# ─── IntentRouter ─────────────────────────────────────────────────────────────

class IntentRouter:
    """
    Analyses a user message and returns a RouteResult containing the
    correct system prompt, live search queries, and RAG filters.

    This class does NOT run the actual search or RAG retrieval — it only
    decides what to search for and how to filter. The chat handler executes
    the searches using LiveSearchClient and passes the results to GroqClient.
    """

    def __init__(self, groq_client: GroqClient | None = None) -> None:
        """
        Args:
            groq_client: Optional shared GroqClient instance. If provided,
                         detect_intent() uses LLM-based classification for
                         ambiguous queries. If None, keyword detection only.
        """
        self._groq  = groq_client
        self.log    = structlog.get_logger(component="IntentRouter")

    # ── Main route method ─────────────────────────────────────────────────────

    async def route(
        self,
        user_message:    str,
        student_profile: dict[str, Any] | None = None,
    ) -> RouteResult:
        """
        Analyse a user message and return a complete routing decision.

        Steps:
          1. Detect intent (keyword scan → LLM fallback if ambiguous)
          2. Extract entities: countries, degree level, field of study
          3. Merge with student profile for richer context
          4. Generate 2-3 optimised live search queries
          5. Build ChromaDB metadata filters
          6. Select system prompt

        Args:
            user_message:    The raw user message string.
            student_profile: Zustand student profile dict.

        Returns:
            RouteResult with all routing decisions filled in.
        """
        profile = student_profile or {}
        msg     = user_message.strip()

        # ── 1. Intent detection ───────────────────────────────────────────────
        if self._groq:
            intent = await self._groq.detect_intent(msg)
        else:
            intent = _keyword_intent(msg)

        self.log.info("route_intent", intent=intent, message=msg[:80])

        # ── 2. Entity extraction ──────────────────────────────────────────────
        msg_countries    = self._extract_countries(msg)
        profile_countries = profile.get("targetCountries", [])

        # Merge: query countries take priority, then profile countries
        all_countries = msg_countries or profile_countries or []
        primary_country = all_countries[0] if all_countries else ""

        degree_from_msg     = self._extract_degree(msg)
        degree_from_profile = profile.get("targetDegree", "")
        degree              = degree_from_msg or degree_from_profile or ""

        field_from_msg     = self._extract_field(msg, profile)
        field_from_profile = profile.get("fieldOfStudy", "")
        field              = field_from_msg or field_from_profile or ""

        nationality = profile.get("nationality", "")

        # ── 3. Build routing based on intent ─────────────────────────────────
        dispatch = {
            "scholarships": self._route_scholarships,
            "universities": self._route_universities,
            "visa":         self._route_visa,
            "documents":    self._route_documents,
            "general":      self._route_general,
        }
        builder = dispatch.get(intent, self._route_general)

        search_queries, rag_filters, context_hint = builder(
            msg=msg,
            primary_country=primary_country,
            all_countries=all_countries,
            degree=degree,
            field=field,
            nationality=nationality,
            profile=profile,
        )

        self.log.info(
            "route_complete",
            intent=intent,
            countries=all_countries,
            degree=degree,
            field=field,
            search_queries=len(search_queries),
        )

        return RouteResult(
            intent=intent,
            system_prompt=get_prompt_for_intent(intent),
            search_queries=search_queries,
            rag_filters=rag_filters,
            detected_countries=all_countries,
            detected_degree=degree,
            detected_field=field,
            context_hint=context_hint,
        )

    # ── Intent-specific routing builders ─────────────────────────────────────

    def _route_scholarships(
        self, msg: str, primary_country: str, all_countries: list[str],
        degree: str, field: str, nationality: str, profile: dict,
    ) -> tuple[list, dict, str]:
        """Build search queries and RAG filters for scholarship queries."""

        search_queries = []

        # Query 1: nationality-specific scholarships for target country
        if primary_country:
            search_queries.append((
                "search_scholarships",
                {
                    "country":        primary_country,
                    "field_of_study": field,
                    "degree_level":   degree,
                    "num_results":    5,
                },
            ))

        # Query 2: general scholarships for nationality
        if nationality and len(search_queries) < 3:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"scholarships for {nationality} students "
                        f"{degree} {field} {primary_country} 2025 fully funded".strip()
                    ),
                    "num_results": 4,
                },
            ))

        # Query 3: government / bilateral scholarships if budget is tight
        budget_max = profile.get("budgetMax", 100000)
        if budget_max < 30000 and len(search_queries) < 3:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"government scholarship bilateral agreement {nationality} "
                        f"{primary_country} {degree} 2025"
                    ),
                    "num_results": 3,
                },
            ))

        rag_filters   = {"category": "scholarship"}
        if primary_country:
            rag_filters["country"] = primary_country

        context_hint = (
            f"Scholarship search: {nationality or 'international'} student, "
            f"{degree or 'any'} degree, {field or 'any field'}, "
            f"targeting {primary_country or 'multiple countries'}"
        )
        return search_queries, rag_filters, context_hint

    def _route_universities(
        self, msg: str, primary_country: str, all_countries: list[str],
        degree: str, field: str, nationality: str, profile: dict,
    ) -> tuple[list, dict, str]:
        """Build search queries and RAG filters for university shortlisting queries."""

        search_queries = []

        # Query 1: universities in target country for the field
        if primary_country:
            search_queries.append((
                "search_universities",
                {
                    "country":      primary_country,
                    "subject":      field,
                    "degree_level": degree,
                    "num_results":  5,
                },
            ))

        # Query 2: admission requirements and acceptance rates
        if field and primary_country and len(search_queries) < 3:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"best {field} {degree} programs {primary_country} "
                        f"international student acceptance rate requirements 2025"
                    ),
                    "num_results": 4,
                },
            ))

        # Query 3: tuition and cost comparison if second country mentioned
        if len(all_countries) > 1 and len(search_queries) < 3:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"{field} {degree} tuition fees {all_countries[1]} "
                        f"international student 2025"
                    ),
                    "num_results": 3,
                },
            ))

        rag_filters   = {"category": "university"}
        if primary_country:
            rag_filters["country"] = primary_country

        context_hint = (
            f"University search: {field or 'any field'} {degree or 'any level'} "
            f"in {primary_country or 'multiple countries'}"
        )
        return search_queries, rag_filters, context_hint

    def _route_visa(
        self, msg: str, primary_country: str, all_countries: list[str],
        degree: str, field: str, nationality: str, profile: dict,
    ) -> tuple[list, dict, str]:
        """Build search queries and RAG filters for visa-related queries."""

        from_country = nationality or profile.get("homeCountry", "")
        to_country   = primary_country

        search_queries = []

        # Query 1: official visa requirements for this country pair
        if from_country and to_country:
            search_queries.append((
                "search_visa_requirements",
                {
                    "from_country": from_country,
                    "to_country":   to_country,
                    "num_results":  5,
                },
            ))
        elif to_country:
            search_queries.append((
                "search_visa_requirements",
                {
                    "from_country": "international students",
                    "to_country":   to_country,
                    "num_results":  5,
                },
            ))

        # Query 2: processing times and common rejection reasons
        if to_country and len(search_queries) < 3:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"student visa {to_country} processing time 2025 "
                        f"documents checklist {from_country}"
                    ),
                    "num_results": 4,
                },
            ))

        # Query 3: financial requirements (often tricky)
        if to_country and len(search_queries) < 3:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"student visa {to_country} financial requirement bank "
                        f"statement funds needed 2025"
                    ),
                    "num_results": 3,
                },
            ))

        rag_filters = {"category": "visa"}
        if to_country:
            rag_filters["country"] = to_country

        context_hint = (
            f"Visa guidance: {from_country or 'international'} "
            f"→ {to_country or 'destination country'}"
        )
        return search_queries, rag_filters, context_hint

    def _route_documents(
        self, msg: str, primary_country: str, all_countries: list[str],
        degree: str, field: str, nationality: str, profile: dict,
    ) -> tuple[list, dict, str]:
        """Build search queries and RAG filters for document checklist queries."""

        search_queries = []

        # Query 1: application documents for target country and degree
        if primary_country:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"study in {primary_country} application documents required "
                        f"{degree} international student checklist 2025"
                    ),
                    "num_results": 5,
                },
            ))

        # Query 2: SOP / personal statement tips (almost always relevant)
        if len(search_queries) < 3:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"statement of purpose tips {field} {degree} international "
                        f"student {primary_country} 2025 how to write"
                    ),
                    "num_results": 3,
                },
            ))

        # Query 3: credential evaluation / document authentication
        if nationality and len(search_queries) < 3:
            search_queries.append((
                "search_general",
                {
                    "query": (
                        f"credential evaluation {nationality} student documents "
                        f"{primary_country} university application requirements"
                    ),
                    "num_results": 3,
                },
            ))

        rag_filters = {"category": "document_req"}
        if primary_country:
            rag_filters["country"] = primary_country

        context_hint = (
            f"Document checklist: {degree or 'any'} in {primary_country or 'target country'}"
        )
        return search_queries, rag_filters, context_hint

    def _route_general(
        self, msg: str, primary_country: str, all_countries: list[str],
        degree: str, field: str, nationality: str, profile: dict,
    ) -> tuple[list, dict, str]:
        """Build search queries for general study-abroad questions."""

        search_queries = []

        # Query 1: direct search from the user message + target country
        query_parts = [msg[:120]]
        if primary_country and primary_country.lower() not in msg.lower():
            query_parts.append(primary_country)
        query_parts.append("international student 2025")

        search_queries.append((
            "search_general",
            {
                "query": " ".join(query_parts),
                "num_results": 5,
            },
        ))

        # Query 2: cost of living if the question is about money/budget
        if any(kw in msg.lower() for kw in ["cost", "expensive", "cheap", "afford", "budget", "money"]):
            city    = self._guess_city(primary_country)
            country = primary_country
            if city:
                search_queries.append((
                    "search_cost_of_living",
                    {"city": city, "country": country, "num_results": 3},
                ))
            elif country:
                search_queries.append((
                    "search_general",
                    {
                        "query": f"cost of living international student {country} monthly budget 2025",
                        "num_results": 3,
                    },
                ))

        rag_filters  = {}
        if primary_country:
            rag_filters["country"] = primary_country

        context_hint = f"General query about {primary_country or 'study abroad'}"
        return search_queries, rag_filters, context_hint

    # ── Entity extraction helpers ─────────────────────────────────────────────

    def _extract_countries(self, text: str) -> list[str]:
        """Scan text for known country names and aliases."""
        lower  = text.lower()
        found: list[str] = []
        seen:  set[str]  = set()

        for alias, canonical in _COUNTRY_ALIASES.items():
            pattern = r"\b" + re.escape(alias) + r"\b"
            if re.search(pattern, lower) and canonical not in seen:
                found.append(canonical)
                seen.add(canonical)
        return found

    def _extract_degree(self, text: str) -> str:
        """Extract degree level from message text."""
        lower = text.lower()
        if any(kw in lower for kw in ["phd","doctorate","doctoral","dphil","research degree"]):
            return "phd"
        if any(kw in lower for kw in ["master","masters","msc","mba","ma ","meng","postgrad"]):
            return "masters"
        if any(kw in lower for kw in ["bachelor","bachelors","undergrad","bsc","ba ","beng","ug"]):
            return "bachelors"
        return ""

    def _extract_field(self, text: str, profile: dict) -> str:
        """
        Extract field of study from message. Falls back to profile.
        Matches common academic field keywords.
        """
        lower = text.lower()
        fields = [
            ("computer science",    ["computer science","cs","software","programming","coding","ai","machine learning"]),
            ("data science",        ["data science","data analytics","statistics"]),
            ("engineering",         ["engineering","mechanical","electrical","civil","chemical"]),
            ("business",            ["business","mba","management","finance","accounting","economics"]),
            ("medicine",            ["medicine","medical","mbbs","nursing","pharmacy","healthcare"]),
            ("law",                 ["law","llb","llm","legal"]),
            ("arts and humanities", ["arts","humanities","history","philosophy","literature","languages"]),
            ("social sciences",     ["social sciences","sociology","psychology","political science"]),
            ("architecture",        ["architecture","urban design","planning"]),
            ("design",              ["design","graphic design","ux","product design"]),
            ("education",           ["education","teaching","pedagogy","edtech"]),
            ("environmental science",["environment","sustainability","climate","ecology"]),
        ]
        for canonical_name, keywords in fields:
            if any(kw in lower for kw in keywords):
                return canonical_name
        return profile.get("fieldOfStudy", "")

    @staticmethod
    def _guess_city(country: str) -> str:
        """Return the most-searched student city for a given country."""
        city_map = {
            "United Kingdom":  "London",
            "United States":   "New York",
            "Canada":          "Toronto",
            "Australia":       "Sydney",
            "Germany":         "Berlin",
            "France":          "Paris",
            "Netherlands":     "Amsterdam",
            "Ireland":         "Dublin",
            "Sweden":          "Stockholm",
            "Singapore":       "Singapore",
            "New Zealand":     "Auckland",
            "Japan":           "Tokyo",
            "South Korea":     "Seoul",
        }
        return city_map.get(country, "")
