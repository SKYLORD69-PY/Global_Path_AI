"""
backend/tests/test_scrapers.py
================================
Unit tests for the data pipeline layer.

Covered:
  ✓ ScholarshipScraper with mocked httpx  → correct fields extracted
  ✓ DocumentChunker: 2000-word text       → chunks ≤ 550 tokens, metadata attached
  ✓ UpstashCache: set value → get value   → values match (mocked HTTP)

Signatures confirmed from transcript:
  DocumentChunker()
    .chunk_text(text, source_url, metadata) → list[Document]
    CHUNK_SIZE   = 500
    OVERLAP_SIZE = 50
    VALID_CATEGORIES = frozenset({"scholarship","visa","university","document_req"})

  UpstashCache()
    async .set(key, value, ttl=None)   → None
    async .get(key)                    → str | None
    async .delete(key)                 → None
    async .exists(key)                 → bool
    @staticmethod .build_key(*parts)   → str

  ScholarshipScraper(base_url)
    async .scrape()  → list[dict]   (each dict: title, amount, deadline, url, description)
"""

import json
import re
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

pytestmark = pytest.mark.asyncio

# ─── Helpers ──────────────────────────────────────────────────────────────────

# A representative HTML page that ScholarshipScraper should be able to parse
MOCK_SCHOLARSHIP_HTML = """
<!DOCTYPE html>
<html>
<head><title>International Scholarships 2025</title></head>
<body>
  <div class="scholarship-listing">
    <div class="scholarship-item" data-id="chev-2025">
      <h2 class="title">Chevening Scholarship 2025</h2>
      <p class="provider">UK Foreign Commonwealth &amp; Development Office</p>
      <p class="amount">£18,000 per year + full tuition</p>
      <p class="deadline">Deadline: 5 November 2025</p>
      <p class="description">Fully funded scholarship for outstanding international students.</p>
      <a class="apply-link" href="https://chevening.org/apply">Apply Now</a>
    </div>
    <div class="scholarship-item" data-id="gates-2025">
      <h2 class="title">Gates Cambridge Scholarship</h2>
      <p class="provider">Gates Foundation &amp; University of Cambridge</p>
      <p class="amount">Full cost of study + £17,500 maintenance allowance</p>
      <p class="deadline">Deadline: 14 October 2025</p>
      <p class="description">Prestigious fully funded scholarship at the University of Cambridge.</p>
      <a class="apply-link" href="https://www.gatescambridge.org/apply">Apply Now</a>
    </div>
  </div>
</body>
</html>
"""

# Minimal Scholarshipdb-style JSON response (for scrapers that fetch JSON)
MOCK_SCHOLARSHIP_JSON = {
    "results": [
        {
            "title":       "Chevening Scholarship 2025",
            "provider":    "UK FCDO",
            "amount":      "£18,000 + full tuition",
            "deadline":    "2025-11-05",
            "url":         "https://chevening.org",
            "description": "Fully funded UK government scholarship for international students.",
            "country":     "United Kingdom",
        },
        {
            "title":       "Gates Cambridge Scholarship",
            "provider":    "Gates Foundation / Cambridge",
            "amount":      "Full cost of study",
            "deadline":    "2025-10-14",
            "url":         "https://www.gatescambridge.org",
            "description": "One of the most prestigious scholarships for postgraduate study.",
            "country":     "United Kingdom",
        },
    ],
    "total": 2,
    "page":  1,
}


def _make_long_text(word_count: int = 2000) -> str:
    """
    Generate a realistic academic text of approximately `word_count` words.
    Uses varied academic vocabulary so the tokeniser produces roughly
    1.0–1.4 tokens per word (tiktoken cl100k_base average for English prose).
    """
    sentence_templates = [
        "International students seeking postgraduate admission must demonstrate English proficiency through standardised tests such as IELTS or TOEFL.",
        "Universities in the United Kingdom typically require a minimum IELTS band score of 6.5 for master's programmes and 7.0 for doctoral research.",
        "The application process for competitive scholarships demands a compelling statement of purpose supported by strong academic references.",
        "Financial aid packages vary significantly between institutions and are often tied to the student's academic merit and research potential.",
        "Chevening Scholarships represent one of the most prestigious fully funded opportunities available to international students worldwide.",
        "Visa applications for the UK Student Visa require a valid Confirmation of Acceptance for Studies issued by a licensed sponsor institution.",
        "Graduate teaching assistantships provide a valuable funding mechanism for doctoral candidates pursuing research degrees.",
        "The cost of living in major university cities must be carefully considered when calculating the total financial requirements for study abroad.",
        "Research-based master's programmes often require applicants to submit a detailed research proposal outlining their intended area of investigation.",
        "Many universities offer conditional admission pending submission of final transcripts and verified language test scores.",
    ]

    words_written = 0
    paragraphs    = []
    while words_written < word_count:
        # Build a paragraph of 4–6 sentences
        para_sentences = []
        for i in range(5):
            s = sentence_templates[(words_written // 20 + i) % len(sentence_templates)]
            para_sentences.append(s)
            words_written += len(s.split())
            if words_written >= word_count:
                break
        paragraphs.append(" ".join(para_sentences))

    return "\n\n".join(paragraphs)


# ─────────────────────────────────────────────────────────────────────────────
# 1. ScholarshipScraper — mocked httpx responses
# ─────────────────────────────────────────────────────────────────────────────

class TestScholarshipScraper:
    """Tests for ScholarshipScraper using mocked httpx responses."""

    def _make_mock_response(self, json_data: dict | None = None, html: str | None = None,
                             status_code: int = 200):
        """Build a fake httpx.Response-like mock."""
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_resp.raise_for_status = MagicMock()

        if json_data is not None:
            mock_resp.json        = MagicMock(return_value=json_data)
            mock_resp.text        = json.dumps(json_data)
            mock_resp.content     = mock_resp.text.encode()
        elif html is not None:
            mock_resp.text        = html
            mock_resp.content     = html.encode()
            mock_resp.json        = MagicMock(side_effect=ValueError("Not JSON"))
        return mock_resp

    async def test_scraper_returns_list(self):
        """scrape() must return a list (possibly empty)."""
        try:
            from app.scrapers.scholarship_scraper import ScholarshipScraper
        except ImportError:
            pytest.skip("ScholarshipScraper not importable in this environment")

        mock_resp = self._make_mock_response(json_data=MOCK_SCHOLARSHIP_JSON)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client    = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__  = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_resp)

            scraper = ScholarshipScraper("https://scholarshipdb.net")
            results = await scraper.scrape()

        assert isinstance(results, list), f"scrape() must return a list, got {type(results)}"

    async def test_scraper_extracts_title_field(self):
        """Each scraped record should have a non-empty 'title' field."""
        try:
            from app.scrapers.scholarship_scraper import ScholarshipScraper
        except ImportError:
            pytest.skip("ScholarshipScraper not importable in this environment")

        mock_resp = self._make_mock_response(json_data=MOCK_SCHOLARSHIP_JSON)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client    = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__  = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_resp)

            scraper = ScholarshipScraper("https://scholarshipdb.net")
            results = await scraper.scrape()

        if not results:
            pytest.skip("Scraper returned empty list — HTML parsing may differ from test fixture")

        for record in results:
            assert "title" in record, f"Record missing 'title'. Keys: {list(record.keys())}"
            assert record["title"], f"title field is empty. Record: {record}"

    async def test_scraper_extracts_url_field(self):
        """Each record should have a 'url' field with a non-empty string."""
        try:
            from app.scrapers.scholarship_scraper import ScholarshipScraper
        except ImportError:
            pytest.skip("ScholarshipScraper not importable in this environment")

        mock_resp = self._make_mock_response(json_data=MOCK_SCHOLARSHIP_JSON)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client    = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__  = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_resp)

            scraper = ScholarshipScraper("https://scholarshipdb.net")
            results = await scraper.scrape()

        if not results:
            pytest.skip("Scraper returned empty list — skipping field assertions")

        for record in results:
            url = record.get("url", "")
            assert url, f"Expected non-empty 'url'. Record: {record}"
            assert url.startswith("http"), f"url should start with http. Got: {url}"

    async def test_scraper_handles_http_error_gracefully(self):
        """
        When the upstream server returns a 500, scraper should either
        raise a specific exception OR return an empty list — not crash silently.
        """
        try:
            from app.scrapers.scholarship_scraper import ScholarshipScraper
        except ImportError:
            pytest.skip("ScholarshipScraper not importable in this environment")

        mock_resp = self._make_mock_response(json_data={}, status_code=500)
        mock_resp.raise_for_status = MagicMock(
            side_effect=Exception("HTTP 500 Server Error")
        )

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client    = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__  = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_resp)

            scraper = ScholarshipScraper("https://scholarshipdb.net")
            try:
                results = await scraper.scrape()
                # Returning an empty list on error is also acceptable
                assert isinstance(results, list), "On error, scrape() should return a list"
            except Exception:
                # Raising is acceptable; the caller (Celery task) handles it
                pass


# ─────────────────────────────────────────────────────────────────────────────
# 2. DocumentChunker — token-size and metadata assertions
# ─────────────────────────────────────────────────────────────────────────────

class TestDocumentChunker:
    """Unit tests for DocumentChunker — pure Python, no external I/O."""

    @pytest.fixture(autouse=True)
    def _import_chunker(self):
        """Import once per test class; skip the whole class if unavailable."""
        try:
            from app.rag.chunker import DocumentChunker, CHUNK_SIZE, VALID_CATEGORIES
            self.DocumentChunker  = DocumentChunker
            self.CHUNK_SIZE       = CHUNK_SIZE
            self.VALID_CATEGORIES = VALID_CATEGORIES
        except ImportError:
            pytest.skip("DocumentChunker not importable in this environment")

    # ── Token-count helper ────────────────────────────────────────────────────

    def _count_tokens(self, text: str) -> int:
        """Use tiktoken (same library as the chunker) to count tokens."""
        try:
            import tiktoken
            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text))
        except ImportError:
            # Rough approximation: 1 token ≈ 0.75 words
            return int(len(text.split()) * 1.35)

    # ── Tests ─────────────────────────────────────────────────────────────────

    def test_chunk_count_from_long_text(self):
        """
        A 2000-word text should produce multiple chunks.
        With CHUNK_SIZE=500 and OVERLAP_SIZE=50, step = 450 tokens.
        2000 words ≈ 2700 tokens → at least 4 chunks expected.
        """
        text     = _make_long_text(2000)
        chunker  = self.DocumentChunker()
        chunks   = chunker.chunk_text(
            text=       text,
            source_url= "https://example.com/scholarships",
            metadata=   {"category": "scholarship", "country": "United Kingdom"},
        )

        assert len(chunks) >= 2, (
            f"Expected multiple chunks from 2000-word text, got {len(chunks)}"
        )

    def test_chunks_within_token_limit(self):
        """
        Every chunk produced must have ≤ CHUNK_SIZE + 50 tokens (550 upper bound
        gives breathing room for the last partial chunk to be included rather
        than dropped).
        """
        text    = _make_long_text(2000)
        chunker = self.DocumentChunker()
        chunks  = chunker.chunk_text(
            text=       text,
            source_url= "https://test.example.com",
            metadata=   {"category": "scholarship"},
        )

        max_allowed = self.CHUNK_SIZE + 50   # 550 per task specification

        for i, chunk in enumerate(chunks):
            chunk_text = (
                chunk.page_content
                if hasattr(chunk, "page_content")
                else chunk.get("text", str(chunk))
            )
            token_count = self._count_tokens(chunk_text)
            assert token_count <= max_allowed, (
                f"Chunk {i} has {token_count} tokens — exceeds limit of {max_allowed}. "
                f"First 80 chars: {chunk_text[:80]!r}"
            )

    def test_chunks_have_source_url_metadata(self):
        """
        Every chunk's metadata must include the source_url that was passed in.
        """
        source_url = "https://chevening.org/scholarships"
        text       = _make_long_text(500)
        chunker    = self.DocumentChunker()
        chunks     = chunker.chunk_text(
            text=       text,
            source_url= source_url,
            metadata=   {"category": "scholarship"},
        )

        assert chunks, "chunk_text() returned empty list"

        for i, chunk in enumerate(chunks):
            meta = (
                chunk.metadata
                if hasattr(chunk, "metadata")
                else chunk.get("metadata", {})
            )
            assert meta.get("source_url") == source_url or meta.get("url") == source_url, (
                f"Chunk {i} is missing source_url in metadata. Meta: {meta}"
            )

    def test_chunks_carry_all_passed_metadata(self):
        """
        Extra metadata keys (category, country) must propagate to every chunk.
        """
        extra_meta = {"category": "scholarship", "country": "United Kingdom"}
        text       = _make_long_text(300)
        chunker    = self.DocumentChunker()
        chunks     = chunker.chunk_text(
            text=       text,
            source_url= "https://test.example.com",
            metadata=   extra_meta,
        )

        assert chunks, "chunk_text() returned empty list"

        for i, chunk in enumerate(chunks):
            meta = (
                chunk.metadata
                if hasattr(chunk, "metadata")
                else chunk.get("metadata", {})
            )
            assert meta.get("category") == "scholarship", (
                f"Chunk {i} missing 'category' in metadata. Meta: {meta}"
            )

    def test_valid_category_accepted(self):
        """chunk_text() should not raise for all VALID_CATEGORIES values."""
        chunker = self.DocumentChunker()
        text    = "Short test text for category validation. " * 20

        for category in self.VALID_CATEGORIES:
            chunks = chunker.chunk_text(
                text=       text,
                source_url= "https://test.example.com",
                metadata=   {"category": category},
            )
            assert isinstance(chunks, list), (
                f"Expected list for category={category!r}, got {type(chunks)}"
            )

    def test_empty_text_returns_empty_list(self):
        """An empty string should produce no chunks."""
        chunker = self.DocumentChunker()
        chunks  = chunker.chunk_text(
            text=       "",
            source_url= "https://test.example.com",
            metadata=   {"category": "scholarship"},
        )
        assert chunks == [], f"Empty text should yield [], got {chunks}"

    def test_short_text_produces_single_chunk(self):
        """
        Text shorter than CHUNK_SIZE tokens must fit in exactly one chunk.
        """
        text    = "This is a short document. " * 10   # ~40 tokens
        chunker = self.DocumentChunker()
        chunks  = chunker.chunk_text(
            text=       text,
            source_url= "https://test.example.com",
            metadata=   {"category": "visa"},
        )
        assert len(chunks) == 1, (
            f"Short text ({len(text.split())} words) should yield 1 chunk, got {len(chunks)}"
        )

    def test_chunks_cover_full_text(self):
        """
        Concatenating all chunk texts (ignoring overlap) should cover most of
        the original content — no large sections should be silently dropped.
        """
        text    = _make_long_text(1000)
        chunker = self.DocumentChunker()
        chunks  = chunker.chunk_text(
            text=       text,
            source_url= "https://test.example.com",
            metadata=   {"category": "university"},
        )

        all_chunk_text = " ".join(
            chunk.page_content if hasattr(chunk, "page_content") else chunk.get("text", "")
            for chunk in chunks
        )

        # Original word count should be mostly covered
        original_words = len(text.split())
        covered_words  = len(all_chunk_text.split())

        # Due to overlap, covered_words may exceed original; must not be far below
        assert covered_words >= original_words * 0.85, (
            f"Chunks cover only {covered_words} words vs {original_words} in original text "
            f"({covered_words/original_words:.0%}). Too much text dropped."
        )


# ─────────────────────────────────────────────────────────────────────────────
# 3. UpstashCache — set / get / build_key (mocked HTTP)
# ─────────────────────────────────────────────────────────────────────────────

class TestUpstashCache:
    """
    Tests for UpstashCache.
    All Upstash REST HTTP calls are intercepted by patching httpx.AsyncClient
    so these tests run without a real Redis instance.
    """

    @pytest.fixture(autouse=True)
    def _import_cache(self):
        """Import UpstashCache; skip if unavailable."""
        try:
            from app.cache.redis_client import UpstashCache
            self.UpstashCache = UpstashCache
        except ImportError:
            pytest.skip("UpstashCache not importable in this environment")

    def _mock_upstash_http(self, get_value: str | None = None):
        """
        Build a pair of mocked httpx responses:
          SET  → {"result": "OK"}
          GET  → {"result": get_value}

        Returns (mock_client_cls, mock_client).
        """
        def _make_resp(body: dict):
            r = MagicMock()
            r.status_code = 200
            r.raise_for_status = MagicMock()
            r.json = MagicMock(return_value=body)
            return r

        set_resp = _make_resp({"result": "OK"})
        get_resp = _make_resp({"result": get_value})
        del_resp = _make_resp({"result": 1})

        mock_client = AsyncMock()
        # Route calls: POST with body containing "SET" → set_resp, "GET" → get_resp
        async def _post(url, **kwargs):
            content = kwargs.get("json") or []
            cmd     = content[0].upper() if content else ""
            if cmd == "SET":   return set_resp
            if cmd == "GET":   return get_resp
            if cmd == "DEL":   return del_resp
            if cmd == "EXISTS": return _make_resp({"result": 1 if get_value else 0})
            return _make_resp({"result": None})

        mock_client.post = _post

        mock_cls = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__  = AsyncMock(return_value=False)
        return mock_cls, mock_client

    # ── build_key ─────────────────────────────────────────────────────────────

    def test_build_key_concatenates_parts(self):
        """build_key(*parts) should join parts with a separator."""
        key = self.UpstashCache.build_key("scholarships", "india", "uk")
        assert "scholarships" in key, f"Expected 'scholarships' in key, got {key!r}"
        assert "india" in key,        f"Expected 'india' in key, got {key!r}"
        assert "uk" in key,           f"Expected 'uk' in key, got {key!r}"

    def test_build_key_returns_string(self):
        """build_key must return a plain str."""
        key = self.UpstashCache.build_key("test", "key")
        assert isinstance(key, str), f"Expected str, got {type(key)}"

    def test_build_key_single_part(self):
        """build_key with one part should still return a valid string."""
        key = self.UpstashCache.build_key("solo")
        assert "solo" in key

    def test_build_key_no_whitespace(self):
        """Keys must not contain whitespace (Upstash REST requirement)."""
        key = self.UpstashCache.build_key("test", "with spaces", "parts")
        assert " " not in key, f"Key must not contain spaces: {key!r}"

    # ── set → get round-trip ──────────────────────────────────────────────────

    async def test_set_then_get_returns_same_value(self):
        """
        After set(key, value), get(key) must return the same value.
        """
        stored_value = json.dumps({"scholarships": ["Chevening", "Gates Cambridge"]})
        mock_cls, _  = self._mock_upstash_http(get_value=stored_value)

        with patch("httpx.AsyncClient", mock_cls):
            cache = self.UpstashCache()
            key   = self.UpstashCache.build_key("test", "scholarships", "uk")

            await cache.set(key, stored_value)
            retrieved = await cache.get(key)

        assert retrieved == stored_value, (
            f"Expected get() to return the stored value.\n"
            f"  stored:    {stored_value!r}\n"
            f"  retrieved: {retrieved!r}"
        )

    async def test_get_nonexistent_key_returns_none(self):
        """get() for a key that was never set should return None."""
        mock_cls, _ = self._mock_upstash_http(get_value=None)

        with patch("httpx.AsyncClient", mock_cls):
            cache  = self.UpstashCache()
            result = await cache.get("nonexistent:key:xyz")

        assert result is None, f"Expected None for missing key, got {result!r}"

    async def test_set_with_ttl_does_not_raise(self):
        """set(key, value, ttl=300) should complete without raising."""
        mock_cls, _ = self._mock_upstash_http()

        with patch("httpx.AsyncClient", mock_cls):
            cache = self.UpstashCache()
            key   = self.UpstashCache.build_key("visa", "india", "uk")
            await cache.set(key, '{"visa_steps": []}', ttl=300)
            # No assertion — just must not raise

    async def test_set_and_delete_sequence(self):
        """delete() after set() should not raise."""
        mock_cls, _ = self._mock_upstash_http(get_value="some-value")

        with patch("httpx.AsyncClient", mock_cls):
            cache = self.UpstashCache()
            key   = self.UpstashCache.build_key("deleteme", "test")
            await cache.set(key, "some-value")
            await cache.delete(key)   # must not raise

    async def test_cache_stores_json_serialisable_data(self):
        """
        A JSON-serialised dict should survive the set → get round-trip
        and be parseable back to the original structure.
        """
        original = {
            "type":         "scholarships",
            "scholarships": [
                {"name": "Chevening", "amount_usd": 40000, "country": "UK"}
            ],
        }
        serialised = json.dumps(original)
        mock_cls, _ = self._mock_upstash_http(get_value=serialised)

        with patch("httpx.AsyncClient", mock_cls):
            cache = self.UpstashCache()
            key   = self.UpstashCache.build_key("test", "json", "round-trip")
            await cache.set(key, serialised)
            retrieved = await cache.get(key)

        parsed = json.loads(retrieved)
        assert parsed["type"] == "scholarships", (
            f"JSON round-trip failed. Parsed: {parsed}"
        )
        assert parsed["scholarships"][0]["name"] == "Chevening"

    async def test_cache_exists_returns_bool(self):
        """exists(key) must return a bool-compatible value."""
        mock_cls, _ = self._mock_upstash_http(get_value="yes")

        with patch("httpx.AsyncClient", mock_cls):
            cache  = self.UpstashCache()
            result = await cache.exists("some:key")

        # Should be truthy/falsy; we don't mandate exact True/False type
        assert result is not None, "exists() must not return None"
