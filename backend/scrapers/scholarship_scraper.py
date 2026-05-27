"""
GlobalPath AI — Scholarship Scraper
=====================================
Scrapes international scholarship listings from ScholarshipDb.net.

Extracts per scholarship:
  name, provider, target_countries, eligible_nationalities,
  degree_level, deadline, amount_usd, application_url, description

Paginates up to MAX_PAGES pages.
Falls back to FALLBACK_SCHOLARSHIPS seed data if the site is unreachable.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from bs4 import BeautifulSoup
import structlog

from .base_scraper import BaseScraper

log = structlog.get_logger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

BASE_URL     = "https://scholarshipdb.net"
SEARCH_URL   = f"{BASE_URL}/scholarships"
MAX_PAGES    = 10
PAGE_PARAM   = "page"

# Degree level keyword mapping — normalises free-text → standard enum values
_DEGREE_MAP: dict[str, str] = {
    "bachelor":   "bachelors",
    "undergrad":  "bachelors",
    "master":     "masters",
    "msc":        "masters",
    "mba":        "masters",
    "postgrad":   "masters",
    "phd":        "phd",
    "doctorate":  "phd",
    "doctoral":   "phd",
    "research":   "phd",
    "all":        "all",
    "any":        "all",
}

# ─── Fallback seed data (used when site is unreachable) ───────────────────────

FALLBACK_SCHOLARSHIPS: list[dict[str, Any]] = [
    {
        "name":                   "Chevening Scholarships",
        "provider":               "UK Foreign, Commonwealth & Development Office",
        "target_countries":       ["United Kingdom"],
        "eligible_nationalities": ["All nationalities (selected countries)"],
        "degree_level":           "masters",
        "deadline":               "2024-11-05",
        "amount_usd":             25000.0,
        "application_url":        "https://www.chevening.org/scholarships/",
        "description": (
            "Chevening is the UK government's international awards programme, "
            "offering full scholarships for a one-year master's degree at any "
            "UK university."
        ),
    },
    {
        "name":                   "Fulbright Foreign Student Program",
        "provider":               "U.S. Department of State",
        "target_countries":       ["United States"],
        "eligible_nationalities": ["All nationalities (non-US citizens)"],
        "degree_level":           "masters",
        "deadline":               "2024-10-15",
        "amount_usd":             35000.0,
        "application_url":        "https://foreign.fulbrightonline.org/",
        "description": (
            "The Fulbright Program offers grants for graduate study, advanced "
            "research, university teaching, and teaching in elementary and "
            "secondary schools."
        ),
    },
    {
        "name":                   "DAAD Scholarships for Foreign Students",
        "provider":               "German Academic Exchange Service (DAAD)",
        "target_countries":       ["Germany"],
        "eligible_nationalities": ["All nationalities"],
        "degree_level":           "masters",
        "deadline":               "2024-10-31",
        "amount_usd":             12000.0,
        "application_url":        "https://www.daad.de/en/study-and-research-in-germany/scholarships/",
        "description": (
            "DAAD offers a wide range of scholarships for international students "
            "wishing to study at German universities. Funding covers tuition, "
            "living expenses, and travel costs."
        ),
    },
    {
        "name":                   "Australia Awards Scholarships",
        "provider":               "Australian Government Department of Foreign Affairs",
        "target_countries":       ["Australia"],
        "eligible_nationalities": ["Indo-Pacific region nationals"],
        "degree_level":           "masters",
        "deadline":               "2024-04-30",
        "amount_usd":             40000.0,
        "application_url":        "https://www.dfat.gov.au/people-to-people/australia-awards",
        "description": (
            "Australia Awards are prestigious international scholarships funded "
            "by the Australian Government for students from the Indo-Pacific "
            "region to study full-time undergraduate or postgraduate courses."
        ),
    },
    {
        "name":                   "Vanier Canada Graduate Scholarships",
        "provider":               "Government of Canada",
        "target_countries":       ["Canada"],
        "eligible_nationalities": ["Canadian and international students"],
        "degree_level":           "phd",
        "deadline":               "2024-11-01",
        "amount_usd":             37000.0,
        "application_url":        "https://vanier.gc.ca/en/home-accueil.html",
        "description": (
            "The Vanier CGS program strengthens Canada's ability to attract and "
            "retain world-class doctoral students. Worth CAD $50,000 per year "
            "for three years."
        ),
    },
    {
        "name":                   "Gates Cambridge Scholarship",
        "provider":               "Gates Cambridge Trust",
        "target_countries":       ["United Kingdom"],
        "eligible_nationalities": ["All nationalities (non-UK citizens)"],
        "degree_level":           "phd",
        "deadline":               "2024-10-11",
        "amount_usd":             45000.0,
        "application_url":        "https://www.gatescambridge.org/",
        "description": (
            "Gates Cambridge Scholarships are awarded to outstanding applicants "
            "from outside the UK to pursue a full-time postgraduate degree at "
            "the University of Cambridge."
        ),
    },
    {
        "name":                   "Erasmus Mundus Joint Masters",
        "provider":               "European Commission",
        "target_countries":       ["Various EU Countries"],
        "eligible_nationalities": ["All nationalities"],
        "degree_level":           "masters",
        "deadline":               "2025-01-15",
        "amount_usd":             14400.0,
        "application_url":        "https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters",
        "description": (
            "Erasmus Mundus Joint Masters are integrated, international study "
            "programmes delivered by a consortium of higher education institutions "
            "across Europe."
        ),
    },
    {
        "name":                   "New Zealand Commonwealth Scholarships",
        "provider":               "New Zealand Ministry of Foreign Affairs and Trade",
        "target_countries":       ["New Zealand"],
        "eligible_nationalities": ["Commonwealth developing country citizens"],
        "degree_level":           "masters",
        "deadline":               "2024-03-31",
        "amount_usd":             20000.0,
        "application_url":        "https://www.mfat.govt.nz/en/aid-and-development/new-zealand-scholarships/",
        "description": (
            "New Zealand Commonwealth Scholarships support students from "
            "Commonwealth developing countries to study for a master's or "
            "doctoral degree at a New Zealand university."
        ),
    },
]


# ─── Scraper ──────────────────────────────────────────────────────────────────

class ScholarshipScraper(BaseScraper):
    """
    Scrapes ScholarshipDb.net for international scholarship listings.

    Iterates through up to MAX_PAGES search result pages, visiting each
    individual scholarship detail page to extract full information.
    """

    name = "ScholarshipScraper"

    def get_fallback_data(self) -> list[dict[str, Any]]:
        return FALLBACK_SCHOLARSHIPS

    # ── Entry Point ────────────────────────────────────────────────────────────

    async def run(self) -> list[dict[str, Any]]:
        """
        Orchestrate the full scrape across all pages.

        Returns:
            Combined list of scholarship dicts from all pages.
        """
        all_results: list[dict[str, Any]] = []

        async with self:
            for page_num in range(1, MAX_PAGES + 1):
                url = f"{SEARCH_URL}?{PAGE_PARAM}={page_num}"
                self.log.info("scraping_page", page=page_num, url=url)

                try:
                    html = await self.fetch_page(url)
                    page_results = await self.parse(html)

                    if not page_results:
                        self.log.info("no_results_on_page", page=page_num, action="stopping_pagination")
                        break

                    # Visit each individual scholarship page for full details
                    for scholarship in page_results:
                        if scholarship.get("application_url"):
                            try:
                                detail_html = await self.fetch_page(scholarship["application_url"])
                                scholarship = self._enrich_from_detail(scholarship, detail_html)
                            except Exception as detail_exc:
                                # Detail page failed — keep the listing data we already have
                                self.log.warning(
                                    "detail_page_failed",
                                    url=scholarship["application_url"],
                                    error=str(detail_exc),
                                )
                        all_results.append(scholarship)
                        await self.polite_delay(1.0, 2.5)

                    self.log.info("page_done", page=page_num, new_results=len(page_results))
                    await self.polite_delay(2.0, 4.0)

                except Exception as exc:
                    self.log.error("page_failed", page=page_num, error=str(exc))
                    if page_num == 1:
                        # First page failed — return fallback data immediately
                        return await self.handle_error(exc, url)
                    # Later pages — stop pagination but keep what we have
                    break

        if not all_results:
            return self.get_fallback_data()

        self.log.info("scrape_complete", total=len(all_results))
        return all_results

    # ── Parsing ────────────────────────────────────────────────────────────────

    async def parse(self, html: str) -> list[dict[str, Any]]:
        """
        Parse the search results listing page.

        Args:
            html: HTML of a ScholarshipDb.net search results page.

        Returns:
            List of partial scholarship dicts (name, url, provider).
            Detail pages are fetched and merged in run().
        """
        soup = BeautifulSoup(html, "lxml")
        results: list[dict[str, Any]] = []

        # ScholarshipDb uses <div class="scholarship-item"> or <article> cards
        cards = (
            soup.select("div.scholarship-item")
            or soup.select("article.scholarship")
            or soup.select(".card.scholarship")
            or soup.select("li.list-group-item")
        )

        for card in cards:
            try:
                record = self._parse_card(card)
                if record:
                    results.append(record)
            except Exception as exc:
                self.log.warning("card_parse_error", error=str(exc))
                continue

        return results

    def _parse_card(self, card) -> dict[str, Any] | None:
        """Parse a single scholarship card element from the listing page."""
        # ── Name ──
        name_el = (
            card.select_one("h2.scholarship-title")
            or card.select_one("h3.scholarship-title")
            or card.select_one(".card-title")
            or card.select_one("a.scholarship-link")
            or card.select_one("h2 a")
            or card.select_one("h3 a")
        )
        if not name_el:
            return None

        name = self.clean_text(name_el.get_text())
        if not name:
            return None

        # ── URL ──
        link_el = card.select_one("a[href]")
        relative_url = link_el["href"] if link_el else ""
        full_url = (
            relative_url
            if relative_url.startswith("http")
            else f"{BASE_URL}{relative_url}"
        )

        # ── Provider / Funder ──
        provider_el = (
            card.select_one(".provider")
            or card.select_one(".funder")
            or card.select_one(".scholarship-provider")
            or card.select_one("span.badge")
        )
        provider = self.clean_text(provider_el.get_text()) if provider_el else "Unknown Provider"

        # ── Country tags ──
        country_tags = card.select(".country-tag, .badge-country, .tag-country")
        target_countries = [self.clean_text(t.get_text()) for t in country_tags] or []

        # ── Degree level ──
        level_el = card.select_one(".degree-level, .badge-level, .level-tag")
        degree_level = (
            self._normalise_degree(self.clean_text(level_el.get_text()))
            if level_el else "all"
        )

        # ── Deadline ──
        deadline_el = card.select_one(".deadline, .date, time[datetime]")
        deadline = ""
        if deadline_el:
            raw_date = deadline_el.get("datetime") or deadline_el.get_text()
            deadline = self._parse_deadline(self.clean_text(raw_date))

        # ── Amount ──
        amount_el = card.select_one(".amount, .funding-amount, .scholarship-amount")
        amount_usd = self.parse_usd_amount(amount_el.get_text() if amount_el else None)

        # ── Short description ──
        desc_el = card.select_one("p.description, .card-text, p.excerpt")
        description = self.clean_text(desc_el.get_text()) if desc_el else ""

        return {
            "name":                   name,
            "provider":               provider,
            "target_countries":       target_countries,
            "eligible_nationalities": [],   # filled in from detail page
            "degree_level":           degree_level,
            "deadline":               deadline or None,
            "amount_usd":             amount_usd,
            "application_url":        full_url,
            "description":            description,
        }

    def _enrich_from_detail(
        self,
        scholarship: dict[str, Any],
        detail_html: str,
    ) -> dict[str, Any]:
        """
        Extract additional fields available only on the scholarship detail page:
          - eligible_nationalities
          - fuller description
          - more precise amount / deadline

        Args:
            scholarship:  Partial dict from _parse_card().
            detail_html:  HTML of the individual scholarship detail page.

        Returns:
            Enriched scholarship dict.
        """
        soup = BeautifulSoup(detail_html, "lxml")

        # ── Eligible nationalities ──
        nat_section = (
            soup.find("strong", string=re.compile(r"nation|eligib|country", re.I))
            or soup.find("dt", string=re.compile(r"nation|eligib", re.I))
        )
        if nat_section:
            sibling = nat_section.find_next("ul") or nat_section.find_next("dd")
            if sibling:
                items = sibling.select("li") or [sibling]
                scholarship["eligible_nationalities"] = [
                    self.clean_text(i.get_text()) for i in items if i.get_text().strip()
                ]

        # ── Description (full) ──
        desc_section = (
            soup.select_one("div.scholarship-description")
            or soup.select_one("div#description")
            or soup.select_one("section.description")
        )
        if desc_section:
            full_desc = self.clean_text(desc_section.get_text())
            if len(full_desc) > len(scholarship.get("description", "")):
                scholarship["description"] = full_desc

        # ── Amount (may be more precise on detail page) ──
        if not scholarship.get("amount_usd"):
            amount_section = soup.find(string=re.compile(r"\$[\d,]+|USD|stipend|award", re.I))
            if amount_section:
                scholarship["amount_usd"] = self.parse_usd_amount(str(amount_section))

        return scholarship

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _normalise_degree(self, raw: str) -> str:
        """Map free-text degree strings to standard enum values."""
        lower = raw.lower()
        for keyword, normalised in _DEGREE_MAP.items():
            if keyword in lower:
                return normalised
        return "all"

    def _parse_deadline(self, raw: str) -> str:
        """
        Try to parse a messy date string into ISO format (YYYY-MM-DD).
        Returns the original string if parsing fails.
        """
        formats = [
            "%B %d, %Y",    # January 15, 2025
            "%b %d, %Y",    # Jan 15, 2025
            "%d %B %Y",     # 15 January 2025
            "%d/%m/%Y",     # 15/01/2025
            "%m/%d/%Y",     # 01/15/2025
            "%Y-%m-%d",     # 2025-01-15  (already ISO)
            "%d-%m-%Y",     # 15-01-2025
        ]
        for fmt in formats:
            try:
                return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        # Couldn't parse — return as-is so we don't lose the data
        return raw
