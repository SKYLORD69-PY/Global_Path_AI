"""
GlobalPath AI — Search Result Formatter
=========================================
Formats raw DuckDuckGo search results into two output shapes:

  1. format_for_llm()     — numbered prose context block injected into
                            the Groq system prompt for RAG-style enrichment
  2. format_as_citations() — clean citation list sent to the React frontend
                             so users can click through to sources

Usage:
    formatter = SearchResultFormatter()

    context   = formatter.format_for_llm(results, query_type="visa")
    citations = formatter.format_as_citations(results)
"""

from __future__ import annotations

from typing import Any

import structlog

log = structlog.get_logger(__name__)

# ─── Query type metadata ──────────────────────────────────────────────────────

_QUERY_LABELS: dict[str, str] = {
    "scholarship":    "Scholarship Opportunities",
    "visa":           "Visa Requirements & Process",
    "university":     "University & Program Information",
    "cost_of_living": "Cost of Living for Students",
    "general":        "Web Search Results",
}

_QUERY_INTRO: dict[str, str] = {
    "scholarship": (
        "The following live web search results contain current scholarship "
        "information. Use these to supplement your knowledge about funding options:"
    ),
    "visa": (
        "The following live web search results contain current visa requirement "
        "information from official and authoritative sources:"
    ),
    "university": (
        "The following live web search results contain current information about "
        "universities, programs, and admission requirements:"
    ),
    "cost_of_living": (
        "The following live web search results contain current cost-of-living "
        "data for students including rent, food, and transport estimates:"
    ),
    "general": (
        "The following live web search results provide current information "
        "relevant to this query:"
    ),
}


class SearchResultFormatter:
    """
    Transforms raw search result dicts into structured text formats
    ready for LLM prompt injection and frontend citation display.
    """

    def __init__(self) -> None:
        self.log = structlog.get_logger(component="SearchResultFormatter")

    # ── LLM context block ─────────────────────────────────────────────────────

    def format_for_llm(
        self,
        results:    list[dict[str, str]],
        query_type: str = "general",
    ) -> str:
        """
        Format search results as a numbered context block for LLM injection.

        Produces output like:

            === Visa Requirements & Process (5 live web results) ===
            The following live web search results contain current visa requirement
            information from official and authoritative sources:

            [1] UK Student Visa Requirements 2025
                Apply for a Student visa to study in the UK. You need a Confirmation
                of Acceptance for Studies (CAS) from your university...
                Source: https://www.gov.uk/student-visa

            [2] F-1 Student Visa | Travel.State.Gov
                ...

        Args:
            results:    List of {"title", "snippet", "url"} dicts.
            query_type: One of "scholarship", "visa", "university",
                        "cost_of_living", "general".

        Returns:
            Formatted multi-line string, or "" if results is empty.
        """
        if not results:
            self.log.debug("format_for_llm_empty", query_type=query_type)
            return ""

        label = _QUERY_LABELS.get(query_type, _QUERY_LABELS["general"])
        intro = _QUERY_INTRO.get(query_type, _QUERY_INTRO["general"])

        lines: list[str] = [
            f"=== {label} ({len(results)} live web results) ===",
            intro,
            "",
        ]

        for i, result in enumerate(results, start=1):
            title   = result.get("title",   "").strip()
            snippet = result.get("snippet", "").strip()
            url     = result.get("url",     "").strip()

            block_lines = [f"[{i}] {title}" if title else f"[{i}] (no title)"]

            if snippet:
                # Wrap long snippets at ~120 chars for readability in logs/prompts
                wrapped = self._soft_wrap(snippet, width=120, indent="    ")
                block_lines.append(wrapped)

            if url:
                block_lines.append(f"    Source: {url}")

            lines.append("\n".join(block_lines))

        self.log.debug("format_for_llm_done", query_type=query_type, blocks=len(results))
        return "\n\n".join(lines)

    # ── Citation list ─────────────────────────────────────────────────────────

    def format_as_citations(
        self,
        results: list[dict[str, str]],
    ) -> list[dict[str, Any]]:
        """
        Format search results as a citation list for the React frontend.

        The frontend renders these as numbered footnote badges that open
        the source URL in a new tab when clicked.

        Args:
            results: List of {"title", "snippet", "url"} dicts.

        Returns:
            List of {"index": int, "title": str, "url": str, "snippet": str}

        Example output:
            [
                {"index": 1, "title": "UK Student Visa", "url": "https://...", "snippet": "..."},
                {"index": 2, "title": "DAAD Scholarships", "url": "https://...", "snippet": "..."},
            ]
        """
        citations = []
        for i, result in enumerate(results, start=1):
            title   = result.get("title",   "").strip()
            url     = result.get("url",     "").strip()
            snippet = result.get("snippet", "").strip()

            if not url:
                continue

            # Truncate long snippets for the tooltip display in the frontend
            short_snippet = snippet[:200] + "..." if len(snippet) > 200 else snippet

            citations.append({
                "index":   i,
                "title":   title or url,
                "url":     url,
                "snippet": short_snippet,
            })

        self.log.debug("format_as_citations_done", count=len(citations))
        return citations

    # ── Combined format (convenience) ────────────────────────────────────────

    def format_full(
        self,
        results:    list[dict[str, str]],
        query_type: str = "general",
    ) -> dict[str, Any]:
        """
        Return both the LLM context block and citation list in one call.

        Returns:
            {
                "llm_context": str,
                "citations":   list[dict],
                "result_count": int,
            }
        """
        return {
            "llm_context":  self.format_for_llm(results, query_type),
            "citations":    self.format_as_citations(results),
            "result_count": len(results),
        }

    # ── Utility ───────────────────────────────────────────────────────────────

    @staticmethod
    def _soft_wrap(text: str, width: int = 120, indent: str = "    ") -> str:
        """
        Soft-wrap text at word boundaries.
        Does not split words; lines may exceed `width` if a single word is longer.
        """
        words        = text.split()
        lines: list[str] = []
        current_line = indent

        for word in words:
            if len(current_line) + len(word) + 1 <= width:
                current_line += ("" if current_line == indent else " ") + word
            else:
                lines.append(current_line)
                current_line = indent + word

        if current_line.strip():
            lines.append(current_line)

        return "\n".join(lines)

    @staticmethod
    def truncate_snippet(snippet: str, max_chars: int = 300) -> str:
        """Truncate a snippet at the last sentence boundary within max_chars."""
        if len(snippet) <= max_chars:
            return snippet
        truncated = snippet[:max_chars]
        last_period = truncated.rfind(". ")
        if last_period > max_chars // 2:
            return truncated[:last_period + 1]
        return truncated.rstrip() + "..."
