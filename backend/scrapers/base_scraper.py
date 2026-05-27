"""
GlobalPath AI — Base Scraper
============================
Abstract base class inherited by all scrapers in the pipeline.

Responsibilities:
  - Async HTTP fetching via httpx with a shared browser-like header set
  - Automatic retry with exponential backoff (max 3 attempts)
  - Optional JavaScript rendering via Playwright
  - Abstract parse() hook for subclasses
  - save_to_db() helper that upserts a list of dicts via SQLAlchemy
  - Structured error handling and logging via structlog
"""

from __future__ import annotations

import abc
import asyncio
import time
import random
from typing import Any

import httpx
import structlog
from playwright.async_api import async_playwright, Browser, BrowserContext
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
    RetryError,
)
import logging

log = structlog.get_logger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

MAX_RETRIES      = 3
BACKOFF_MIN_SECS = 2      # first retry waits at least 2 s
BACKOFF_MAX_SECS = 30     # cap the wait at 30 s
REQUEST_TIMEOUT  = 30.0   # httpx timeout in seconds

# Rotate through a small pool of real-world user agents to reduce blocking
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

_BASE_HEADERS = {
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
    "DNT":             "1",
}


# ─── Retry decorator (shared by fetch_page) ───────────────────────────────────

def _make_retry_decorator():
    """Build a tenacity retry decorator with exponential backoff."""
    return retry(
        reraise=True,
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=BACKOFF_MIN_SECS, max=BACKOFF_MAX_SECS),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
        before_sleep=before_sleep_log(logging.getLogger(__name__), logging.WARNING),
    )


# ─── Abstract Base Scraper ────────────────────────────────────────────────────

class BaseScraper(abc.ABC):
    """
    Abstract base class for all GlobalPath AI scrapers.

    Subclasses must implement:
        parse(html: str) -> list[dict]

    Optional overrides:
        get_fallback_data() -> list[dict]   — returned when scraping fails completely
    """

    #: Override in subclass to give the scraper a human-readable name used in logs
    name: str = "BaseScraper"

    def __init__(self, db_session: AsyncSession | None = None) -> None:
        """
        Args:
            db_session: An async SQLAlchemy session. If None, save_to_db() is a no-op.
        """
        self.db_session = db_session
        self._http_client: httpx.AsyncClient | None = None
        self._playwright_browser: Browser | None = None
        self._playwright_context: BrowserContext | None = None
        self.log = structlog.get_logger(scraper=self.name)

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def __aenter__(self) -> "BaseScraper":
        await self._init_http_client()
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()

    async def _init_http_client(self) -> None:
        """Initialise a shared httpx.AsyncClient with sane defaults."""
        self._http_client = httpx.AsyncClient(
            headers={**_BASE_HEADERS, "User-Agent": random.choice(_USER_AGENTS)},
            timeout=httpx.Timeout(REQUEST_TIMEOUT),
            follow_redirects=True,
            http2=True,              # use HTTP/2 when the server supports it
        )

    async def close(self) -> None:
        """Release all resources (HTTP client + Playwright browser)."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
        if self._playwright_browser:
            await self._playwright_browser.close()
            self._playwright_browser = None

    # ── Core Fetch ─────────────────────────────────────────────────────────────

    async def fetch_page(self, url: str, *, use_playwright: bool = False) -> str:
        """
        Fetch the HTML content of a URL.

        Tries up to MAX_RETRIES times with exponential backoff on network errors.
        For JavaScript-heavy pages set use_playwright=True.

        Args:
            url:            The full URL to fetch.
            use_playwright: When True, renders the page in a headless Chromium
                            browser and returns the final DOM HTML.

        Returns:
            The HTML string of the (fully-rendered) page.

        Raises:
            httpx.HTTPStatusError: if the server returns a 4xx/5xx after all retries.
            RetryError:            if all retries are exhausted.
        """
        if use_playwright:
            return await self._fetch_with_playwright(url)
        return await self._fetch_with_httpx(url)

    @_make_retry_decorator()
    async def _fetch_with_httpx(self, url: str) -> str:
        """HTTP fetch with tenacity retry decoration applied."""
        if self._http_client is None:
            await self._init_http_client()

        self.log.info("fetch_start", url=url, transport="httpx")
        response = await self._http_client.get(url)
        response.raise_for_status()

        self.log.info(
            "fetch_ok",
            url=url,
            status=response.status_code,
            size_kb=round(len(response.content) / 1024, 1),
        )
        return response.text

    async def _fetch_with_playwright(self, url: str) -> str:
        """
        Render the page in headless Chromium via Playwright.
        Waits for the network to go idle before returning HTML so that
        JavaScript-rendered content is included.
        """
        if self._playwright_browser is None:
            pw = await async_playwright().__aenter__()
            self._playwright_browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            self._playwright_context = await self._playwright_browser.new_context(
                user_agent=random.choice(_USER_AGENTS),
                locale="en-US",
            )

        self.log.info("fetch_start", url=url, transport="playwright")
        page = await self._playwright_context.new_page()

        attempt = 0
        while attempt < MAX_RETRIES:
            try:
                await page.goto(url, wait_until="networkidle", timeout=45_000)
                html = await page.content()
                await page.close()
                self.log.info("fetch_ok", url=url, transport="playwright")
                return html
            except Exception as exc:
                attempt += 1
                wait = BACKOFF_MIN_SECS * (2 ** attempt) + random.uniform(0, 1)
                self.log.warning(
                    "fetch_retry",
                    url=url,
                    attempt=attempt,
                    wait=round(wait, 1),
                    error=str(exc),
                )
                if attempt >= MAX_RETRIES:
                    await page.close()
                    raise
                await asyncio.sleep(wait)

    # ── Abstract Methods ───────────────────────────────────────────────────────

    @abc.abstractmethod
    async def parse(self, html: str) -> list[dict[str, Any]]:
        """
        Parse the raw HTML returned by fetch_page() into a list of dicts.

        Each dict represents one record (e.g. one scholarship, one visa requirement).
        Keys should match the SQLAlchemy model column names.

        Args:
            html: Raw HTML string.

        Returns:
            List of record dicts ready for save_to_db().
        """
        ...

    def get_fallback_data(self) -> list[dict[str, Any]]:
        """
        Override in subclass to return hardcoded seed data used when
        live scraping fails completely (e.g. site is down, blocked).
        Base implementation returns an empty list.
        """
        return []

    # ── Database ───────────────────────────────────────────────────────────────

    async def save_to_db(
        self,
        records: list[dict[str, Any]],
        model,
        conflict_column: str,
    ) -> int:
        """
        Upsert a list of record dicts into the database using PostgreSQL's
        INSERT … ON CONFLICT DO UPDATE (so re-running the scraper is safe).

        Args:
            records:         List of dicts returned by parse().
            model:           The SQLAlchemy ORM model class (e.g. Scholarship).
            conflict_column: The column name used as the unique conflict key
                             (e.g. "application_url" for scholarships).

        Returns:
            Number of rows upserted.

        Raises:
            RuntimeError: if no db_session was provided at construction time.
        """
        if not records:
            self.log.info("save_to_db_skip", reason="empty records list")
            return 0

        if self.db_session is None:
            self.log.warning("save_to_db_skip", reason="no db_session provided")
            return 0

        self.log.info("save_to_db_start", model=model.__tablename__, count=len(records))

        stmt = pg_insert(model).values(records)
        # On duplicate, update all columns except the primary key and created_at
        update_cols = {
            c.name: c
            for c in stmt.excluded
            if c.name not in ("id", "created_at", conflict_column)
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=[conflict_column],
            set_=update_cols,
        )

        try:
            await self.db_session.execute(stmt)
            await self.db_session.commit()
            self.log.info("save_to_db_ok", model=model.__tablename__, upserted=len(records))
            return len(records)
        except Exception as exc:
            await self.db_session.rollback()
            self.log.error("save_to_db_error", error=str(exc))
            raise

    # ── Error Handling ─────────────────────────────────────────────────────────

    async def handle_error(self, exc: Exception, url: str = "") -> list[dict[str, Any]]:
        """
        Central error handler called by subclasses when scraping fails
        after all retries are exhausted.

        Logs the error, then returns fallback seed data so the pipeline
        continues rather than leaving the database empty.

        Args:
            exc: The exception that caused the failure.
            url: The URL being scraped (for logging context).

        Returns:
            Fallback data from get_fallback_data(), or [].
        """
        self.log.error(
            "scrape_failed",
            url=url,
            error_type=type(exc).__name__,
            error=str(exc),
            action="returning_fallback_data",
        )
        fallback = self.get_fallback_data()
        if fallback:
            self.log.info("fallback_data_used", count=len(fallback))
        return fallback

    # ── Convenience Helpers ────────────────────────────────────────────────────

    @staticmethod
    async def polite_delay(min_s: float = 1.5, max_s: float = 4.0) -> None:
        """
        Sleep for a random duration between min_s and max_s seconds.
        Call between page requests to avoid hammering servers.
        """
        delay = random.uniform(min_s, max_s)
        await asyncio.sleep(delay)

    @staticmethod
    def clean_text(text: str | None) -> str:
        """Strip leading/trailing whitespace and collapse internal whitespace."""
        if not text:
            return ""
        return " ".join(text.split())

    @staticmethod
    def parse_usd_amount(raw: str | None) -> float | None:
        """
        Parse a messy dollar string like "$12,500 per year" → 12500.0.
        Returns None if no numeric value can be extracted.
        """
        if not raw:
            return None
        import re
        numbers = re.findall(r"[\d,]+(?:\.\d+)?", raw.replace(",", ""))
        if numbers:
            try:
                return float(numbers[0])
            except ValueError:
                pass
        return None
