"""
GlobalPath AI — Visa Requirements Scraper
==========================================
Scrapes official government immigration portals for student visa requirements.

Covered country pairs and official sources:
  UK       → https://www.gov.uk/student-visa
  Canada   → https://www.canada.ca/en/immigration-refugees-citizenship (IRCC)
  USA      → https://travel.state.gov (F-1 Student Visa)
  Germany  → https://www.bamf.de + https://www.daad.de
  Australia→ https://immi.homeaffairs.gov.au

Extracted fields per visa:
  visa_type, from_country ("All" for generic requirements), to_country,
  required_documents, processing_time, fee_usd, official_url
"""

from __future__ import annotations

from typing import Any

from bs4 import BeautifulSoup
import structlog

from .base_scraper import BaseScraper

log = structlog.get_logger(__name__)

# ─── Visa Target Config ───────────────────────────────────────────────────────

VISA_TARGETS: list[dict[str, str]] = [
    {
        "to_country":   "United Kingdom",
        "visa_type":    "Student Visa (Tier 4)",
        "official_url": "https://www.gov.uk/student-visa",
        "use_playwright": "false",
    },
    {
        "to_country":   "Canada",
        "visa_type":    "Student Permit",
        "official_url": "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html",
        "use_playwright": "false",
    },
    {
        "to_country":   "United States",
        "visa_type":    "F-1 Student Visa",
        "official_url": "https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html",
        "use_playwright": "false",
    },
    {
        "to_country":   "Germany",
        "visa_type":    "Student Visa (National Visa D)",
        "official_url": "https://www.germany-visa.org/student-visa/",
        "use_playwright": "false",
    },
    {
        "to_country":   "Australia",
        "visa_type":    "Student Visa (Subclass 500)",
        "official_url": "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
        "use_playwright": "true",
    },
]

# ─── Fallback Data ────────────────────────────────────────────────────────────
# Curated, verified requirements used when live scraping fails.
# Updated manually whenever official requirements change.

FALLBACK_VISA_DATA: list[dict[str, Any]] = [
    {
        "visa_type":    "Student Visa (Tier 4)",
        "from_country": "All",
        "to_country":   "United Kingdom",
        "required_documents": [
            "Valid passport (valid for duration of your course)",
            "Confirmation of Acceptance for Studies (CAS) from your university",
            "Proof of English language proficiency (IELTS, TOEFL, etc.)",
            "Proof of financial funds (covers tuition + £1,334/month in London or £1,023/month outside London)",
            "Academic transcripts and qualifications",
            "ATAS certificate (if applicable for certain science/engineering courses)",
            "Tuberculosis (TB) test results (if from a listed country)",
            "Parental consent letter (if under 18)",
        ],
        "processing_time": "3 weeks (standard); same-day to 5 days (priority)",
        "fee_usd":         490.0,
        "official_url":    "https://www.gov.uk/student-visa",
    },
    {
        "visa_type":    "Student Permit",
        "from_country": "All",
        "to_country":   "Canada",
        "required_documents": [
            "Valid passport",
            "Letter of acceptance from a Designated Learning Institution (DLI)",
            "Proof of financial support (tuition + CAD $10,000 per year living costs)",
            "Proof of English/French language proficiency",
            "Statement of purpose / Letter of explanation",
            "Academic transcripts",
            "Police clearance certificate (if applicable)",
            "Medical examination results (if applicable)",
            "Biometrics (fingerprints and photo)",
            "Digital photograph meeting IRCC specifications",
        ],
        "processing_time": "8 weeks (online application); 4 weeks average",
        "fee_usd":         115.0,
        "official_url":    "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html",
    },
    {
        "visa_type":    "F-1 Student Visa",
        "from_country": "All",
        "to_country":   "United States",
        "required_documents": [
            "Valid passport (valid for at least 6 months beyond intended stay)",
            "Form I-20 (Certificate of Eligibility) issued by your SEVP-approved school",
            "DS-160 Online Nonimmigrant Visa Application confirmation page",
            "SEVIS fee payment receipt (Form I-901, USD $350)",
            "Visa application fee payment receipt (MRV fee, USD $185)",
            "Photograph meeting DOS specifications",
            "Academic transcripts, diplomas, degrees",
            "Standardised test scores (SAT/GRE/GMAT as applicable)",
            "Proof of English language proficiency (TOEFL/IELTS)",
            "Proof of financial support (bank statements, sponsor letter)",
            "Evidence of ties to home country (to prove intent to return)",
        ],
        "processing_time": "Varies by embassy; typically 2–8 weeks after interview",
        "fee_usd":         535.0,
        "official_url":    "https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html",
    },
    {
        "visa_type":    "Student Visa (National Visa D)",
        "from_country": "All",
        "to_country":   "Germany",
        "required_documents": [
            "Valid national passport",
            "Completed visa application form (signed)",
            "University admission letter or Zulassungsbescheid",
            "Proof of language proficiency (German: TestDaF, DSH; or English: IELTS/TOEFL)",
            "Proof of financial resources (blocked account Sperrkonto with approx. €11,208/year OR scholarship proof)",
            "Health insurance valid in Germany",
            "Academic transcripts and certificates (certified German translation if not in German/English)",
            "Curriculum Vitae (CV)",
            "Passport biometric photos (35×45 mm)",
            "Application fee payment",
        ],
        "processing_time": "4–12 weeks (varies by German consulate and applicant nationality)",
        "fee_usd":         78.0,
        "official_url":    "https://www.bamf.de/EN/Themen/MigrationAufenthalt/Studium/studium-node.html",
    },
    {
        "visa_type":    "Student Visa (Subclass 500)",
        "from_country": "All",
        "to_country":   "Australia",
        "required_documents": [
            "Valid passport",
            "Confirmation of Enrolment (CoE) from a registered Australian education provider",
            "Genuine Temporary Entrant (GTE) statement",
            "Proof of English language proficiency (IELTS, TOEFL, PTE Academic, or Cambridge)",
            "Proof of financial capacity (tuition fees + AUD $21,041/year living costs)",
            "Overseas Student Health Cover (OSHC) for the duration of your visa",
            "Academic transcripts and qualifications",
            "Statement of Purpose",
            "Health examinations (if required by home country)",
            "Police clearance certificate (if 18+ and staying more than 12 months)",
            "Biometrics",
        ],
        "processing_time": "75% of applications processed within 29 days; 90% within 44 days",
        "fee_usd":         445.0,
        "official_url":    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
    },
]


# ─── Scraper ──────────────────────────────────────────────────────────────────

class VisaScraper(BaseScraper):
    """
    Scrapes official government portals for student visa requirements.

    Each target is scraped by a dedicated parser method named
    _parse_<country_slug>() for maintainability. If a parser method
    isn't found, the generic _parse_generic() is used.
    """

    name = "VisaScraper"

    def get_fallback_data(self) -> list[dict[str, Any]]:
        return FALLBACK_VISA_DATA

    # ── Entry Point ────────────────────────────────────────────────────────────

    async def run(self) -> list[dict[str, Any]]:
        """
        Scrape all visa targets and return combined results.

        Returns:
            List of visa requirement dicts (one per target country).
        """
        results: list[dict[str, Any]] = []

        async with self:
            for target in VISA_TARGETS:
                to_country   = target["to_country"]
                official_url = target["official_url"]
                use_pw       = target["use_playwright"] == "true"

                self.log.info("scraping_visa", country=to_country, url=official_url)

                try:
                    html = await self.fetch_page(official_url, use_playwright=use_pw)
                    record = await self.parse(html, target=target)
                    results.append(record)
                    self.log.info("visa_scraped", country=to_country)
                except Exception as exc:
                    self.log.error(
                        "visa_scrape_failed",
                        country=to_country,
                        error=str(exc),
                        action="using_fallback",
                    )
                    # Use the matching fallback entry for this country
                    fallback = next(
                        (f for f in FALLBACK_VISA_DATA if f["to_country"] == to_country),
                        None,
                    )
                    if fallback:
                        results.append(fallback)

                await self.polite_delay(2.0, 5.0)

        if not results:
            self.log.warning("all_visa_scrapes_failed", action="returning_full_fallback")
            return self.get_fallback_data()

        return results

    # ── Dispatcher parse() ─────────────────────────────────────────────────────

    async def parse(self, html: str, target: dict[str, str] | None = None) -> dict[str, Any]:
        """
        Dispatch to the correct country-specific parser, falling back to generic.

        Args:
            html:   Raw HTML from fetch_page().
            target: Metadata dict from VISA_TARGETS.

        Returns:
            Single visa requirement record dict.
        """
        if target is None:
            return self._build_empty_record()

        to_country = target["to_country"]
        slug = to_country.lower().replace(" ", "_")
        parser = getattr(self, f"_parse_{slug}", self._parse_generic)

        return parser(html, target)

    # ── Country-specific Parsers ───────────────────────────────────────────────

    def _parse_united_kingdom(self, html: str, target: dict) -> dict[str, Any]:
        """Parser for gov.uk/student-visa."""
        soup = BeautifulSoup(html, "lxml")
        docs = self._extract_list_items(
            soup,
            section_keywords=["you'll need", "you need", "documents", "apply"],
        )
        return {
            "visa_type":          target["visa_type"],
            "from_country":       "All",
            "to_country":         target["to_country"],
            "required_documents": docs or FALLBACK_VISA_DATA[0]["required_documents"],
            "processing_time":    self._extract_processing_time(soup) or "3 weeks",
            "fee_usd":            self._extract_fee(soup) or 490.0,
            "official_url":       target["official_url"],
        }

    def _parse_canada(self, html: str, target: dict) -> dict[str, Any]:
        """Parser for IRCC Canada study permit page."""
        soup = BeautifulSoup(html, "lxml")
        docs = self._extract_list_items(
            soup,
            section_keywords=["documents", "you will need", "required", "gather"],
        )
        return {
            "visa_type":          target["visa_type"],
            "from_country":       "All",
            "to_country":         target["to_country"],
            "required_documents": docs or FALLBACK_VISA_DATA[1]["required_documents"],
            "processing_time":    self._extract_processing_time(soup) or "8 weeks",
            "fee_usd":            self._extract_fee(soup) or 115.0,
            "official_url":       target["official_url"],
        }

    def _parse_united_states(self, html: str, target: dict) -> dict[str, Any]:
        """Parser for travel.state.gov F-1 student visa page."""
        soup = BeautifulSoup(html, "lxml")
        docs = self._extract_list_items(
            soup,
            section_keywords=["required documents", "how to apply", "steps", "gather"],
        )
        return {
            "visa_type":          target["visa_type"],
            "from_country":       "All",
            "to_country":         target["to_country"],
            "required_documents": docs or FALLBACK_VISA_DATA[2]["required_documents"],
            "processing_time":    self._extract_processing_time(soup) or "2–8 weeks",
            "fee_usd":            self._extract_fee(soup) or 535.0,
            "official_url":       target["official_url"],
        }

    def _parse_germany(self, html: str, target: dict) -> dict[str, Any]:
        """Parser for germany-visa.org student visa page."""
        soup = BeautifulSoup(html, "lxml")
        docs = self._extract_list_items(
            soup,
            section_keywords=["documents", "required", "checklist", "need"],
        )
        return {
            "visa_type":          target["visa_type"],
            "from_country":       "All",
            "to_country":         target["to_country"],
            "required_documents": docs or FALLBACK_VISA_DATA[3]["required_documents"],
            "processing_time":    self._extract_processing_time(soup) or "4–12 weeks",
            "fee_usd":            self._extract_fee(soup) or 78.0,
            "official_url":       target["official_url"],
        }

    def _parse_australia(self, html: str, target: dict) -> dict[str, Any]:
        """Parser for immi.homeaffairs.gov.au student visa (subclass 500)."""
        soup = BeautifulSoup(html, "lxml")
        docs = self._extract_list_items(
            soup,
            section_keywords=["you must", "documents", "evidence", "provide"],
        )
        return {
            "visa_type":          target["visa_type"],
            "from_country":       "All",
            "to_country":         target["to_country"],
            "required_documents": docs or FALLBACK_VISA_DATA[4]["required_documents"],
            "processing_time":    self._extract_processing_time(soup) or "29–44 days",
            "fee_usd":            self._extract_fee(soup) or 445.0,
            "official_url":       target["official_url"],
        }

    def _parse_generic(self, html: str, target: dict) -> dict[str, Any]:
        """
        Generic fallback parser used for any country without a dedicated parser.
        Tries its best to extract a document list and fee from any government page.
        """
        soup = BeautifulSoup(html, "lxml")
        docs = self._extract_list_items(soup, section_keywords=["documents", "required", "need"])

        # Find matching fallback for this country in case we can't extract anything
        fallback = next(
            (f for f in FALLBACK_VISA_DATA if f["to_country"] == target.get("to_country")),
            None,
        )

        return {
            "visa_type":          target.get("visa_type", "Student Visa"),
            "from_country":       "All",
            "to_country":         target.get("to_country", "Unknown"),
            "required_documents": docs or (fallback["required_documents"] if fallback else []),
            "processing_time":    self._extract_processing_time(soup) or (fallback["processing_time"] if fallback else ""),
            "fee_usd":            self._extract_fee(soup) or (fallback["fee_usd"] if fallback else None),
            "official_url":       target.get("official_url", ""),
        }

    # ── HTML Extraction Helpers ────────────────────────────────────────────────

    def _extract_list_items(
        self,
        soup: BeautifulSoup,
        section_keywords: list[str],
    ) -> list[str]:
        """
        Find a section whose heading contains one of the keywords, then
        return all <li> text items within it.

        Strategy: scan all headings (h1–h4) and bold/strong elements for a
        keyword match, then collect the nearest sibling or child <ul>/<ol>.
        """
        # First pass: look for a heading containing a keyword
        for kw in section_keywords:
            for heading in soup.find_all(["h1", "h2", "h3", "h4", "strong", "b"]):
                if kw.lower() in heading.get_text().lower():
                    # Look for the next <ul> or <ol> sibling
                    sibling = heading.find_next(["ul", "ol"])
                    if sibling:
                        items = [
                            self.clean_text(li.get_text())
                            for li in sibling.find_all("li")
                            if li.get_text().strip()
                        ]
                        if items:
                            return items

        # Second pass: just grab the largest <ul> on the page (heuristic)
        all_lists = soup.find_all("ul")
        if all_lists:
            biggest = max(all_lists, key=lambda ul: len(ul.find_all("li")))
            items = [
                self.clean_text(li.get_text())
                for li in biggest.find_all("li")
                if len(li.get_text().strip()) > 10  # filter out nav/footer items
            ]
            if items:
                return items

        return []

    def _extract_processing_time(self, soup: BeautifulSoup) -> str:
        """
        Search page text for processing time phrases like
        "processed within 4 weeks" or "approximately 8–12 weeks".
        """
        import re
        text = soup.get_text(" ", strip=True)
        patterns = [
            r"(\d+[\–\-]?\d*\s*(?:business\s)?(?:days?|weeks?|months?)(?:\s+processing)?)",
            r"processing\s+time[^\.\n]*?(\d+[^\.\n]*?(?:days?|weeks?|months?))",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                return self.clean_text(match.group(1))
        return ""

    def _extract_fee(self, soup: BeautifulSoup) -> float | None:
        """
        Search page text for visa fee amounts. Tries USD, GBP, EUR, AUD, CAD.
        Converts common currencies to approximate USD.
        """
        import re
        text = soup.get_text(" ", strip=True)
        patterns = [
            (r"USD\s*\$?([\d,]+)", 1.0),
            (r"\$([\d,]+)\s*USD",  1.0),
            (r"GBP\s*£?([\d,]+)",  1.27),
            (r"£([\d,]+)",         1.27),
            (r"EUR?\s*€?([\d,]+)", 1.08),
            (r"€([\d,]+)",         1.08),
            (r"AUD\s*\$?([\d,]+)", 0.65),
            (r"CAD\s*\$?([\d,]+)", 0.73),
        ]
        for pattern, usd_rate in patterns:
            match = re.search(pattern, text, re.I)
            if match:
                try:
                    amount = float(match.group(1).replace(",", ""))
                    return round(amount * usd_rate, 2)
                except ValueError:
                    continue
        return None

    @staticmethod
    def _build_empty_record() -> dict[str, Any]:
        return {
            "visa_type":          "",
            "from_country":       "All",
            "to_country":         "",
            "required_documents": [],
            "processing_time":    "",
            "fee_usd":            None,
            "official_url":       "",
        }
