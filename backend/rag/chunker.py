"""
GlobalPath AI — Document Chunker
==================================
Splits raw text (scraped from DB records) into token-bounded chunks
that are small enough to fit inside an LLM prompt context window while
preserving enough context for accurate retrieval.

Strategy:
  - Target chunk size : 500 tokens
  - Overlap           : 50 tokens  (so retrieval doesn't miss content at boundaries)
  - Token counter     : tiktoken cl100k_base  (same tokeniser as GPT-4 / most open models)
  - Sentence-aware    : splits on sentence boundaries first, then on whitespace, so
                        a chunk never cuts mid-sentence when avoidable

Output per chunk (a LangChain Document):
  page_content  : the raw chunk text
  metadata      : source_url, country, category, scraped_at, chunk_index,
                  total_chunks, record_id, record_type
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import tiktoken
import structlog
from langchain_core.documents import Document

log = structlog.get_logger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

CHUNK_SIZE    = 500    # target tokens per chunk
OVERLAP_SIZE  = 50     # tokens repeated at the start of the next chunk
ENCODING_NAME = "cl100k_base"   # tiktoken encoding compatible with most modern LLMs

# Valid category values for ChromaDB metadata filtering
VALID_CATEGORIES = frozenset(["scholarship", "visa", "university", "document_req"])


# ─── Chunker ──────────────────────────────────────────────────────────────────

class DocumentChunker:
    """
    Splits text into overlapping, token-bounded chunks and attaches
    structured metadata to each chunk for downstream filtering.

    Usage:
        chunker = DocumentChunker()
        chunks  = chunker.chunk_text(
            text       = long_description,
            source_url = "https://chevening.org",
            metadata   = {"country": "United Kingdom", "category": "scholarship"},
        )
        all_chunks = await chunker.chunk_all_db_records(db_session)
    """

    def __init__(
        self,
        chunk_size:   int = CHUNK_SIZE,
        overlap_size: int = OVERLAP_SIZE,
    ) -> None:
        self.chunk_size   = chunk_size
        self.overlap_size = overlap_size
        self._enc         = tiktoken.get_encoding(ENCODING_NAME)
        self.log          = structlog.get_logger(component="DocumentChunker")

    # ── Token helpers ──────────────────────────────────────────────────────────

    def _count_tokens(self, text: str) -> int:
        """Return the number of tokens in *text* using the cl100k_base encoding."""
        return len(self._enc.encode(text))

    def _decode_tokens(self, token_ids: list[int]) -> str:
        """Decode a list of token IDs back to a string."""
        return self._enc.decode(token_ids)

    def _encode(self, text: str) -> list[int]:
        """Encode text to a list of integer token IDs."""
        return self._enc.encode(text)

    # ── Core chunking ──────────────────────────────────────────────────────────

    def _split_into_sentences(self, text: str) -> list[str]:
        """
        Split *text* into sentences using a lightweight regex.
        Falls back to paragraph splitting, then whitespace splitting.
        """
        sentence_pattern = re.compile(
            r"(?<=[.!?])\s+(?=[A-Z\u00C0-\u024F\"\'(])",
        )
        sentences = sentence_pattern.split(text.strip())
        if len(sentences) <= 1:
            sentences = re.split(r"\n{2,}", text.strip())
        if len(sentences) <= 1:
            sentences = text.strip().splitlines()
        return [s.strip() for s in sentences if s.strip()]

    def _build_chunks_from_tokens(self, all_tokens: list[int]) -> list[str]:
        """
        Slide a window of `chunk_size` tokens over `all_tokens` with
        `overlap_size` token overlap, decoding each window to a string.
        """
        chunks: list[str] = []
        start = 0
        total = len(all_tokens)

        while start < total:
            end        = min(start + self.chunk_size, total)
            chunk_text = self._decode_tokens(all_tokens[start:end])
            chunks.append(chunk_text.strip())
            if end == total:
                break
            start += self.chunk_size - self.overlap_size

        return [c for c in chunks if c]

    # ── Public API ─────────────────────────────────────────────────────────────

    def chunk_text(
        self,
        text:       str,
        source_url: str,
        metadata:   dict[str, Any],
    ) -> list[Document]:
        """
        Split *text* into overlapping token-bounded chunks, each wrapped
        in a LangChain Document with enriched metadata.

        Args:
            text:       Raw text to chunk (can be any length).
            source_url: The URL the text was scraped from. Stored in metadata.
            metadata:   Dict that MUST include 'category' and SHOULD include
                        'country'. Extra keys are passed through as-is.

        Returns:
            List of LangChain Documents. Empty list for empty input.

        Raises:
            ValueError: if metadata['category'] is not in VALID_CATEGORIES.
        """
        if not text or not text.strip():
            self.log.warning("chunk_text_empty_input", source_url=source_url)
            return []

        category = metadata.get("category", "")
        if category and category not in VALID_CATEGORIES:
            raise ValueError(
                f"Invalid category {category!r}. "
                f"Must be one of: {sorted(VALID_CATEGORIES)}"
            )

        sentences  = self._split_into_sentences(text)
        full_tokens: list[int] = []
        for sentence in sentences:
            full_tokens.extend(self._encode(sentence + " "))

        if not full_tokens:
            return []

        raw_chunks = self._build_chunks_from_tokens(full_tokens)
        total      = len(raw_chunks)

        documents: list[Document] = []
        for idx, chunk_text in enumerate(raw_chunks):
            doc = Document(
                page_content=chunk_text,
                metadata={
                    "source_url":   source_url,
                    "scraped_at":   metadata.get(
                        "scraped_at",
                        datetime.now(timezone.utc).isoformat(),
                    ),
                    "category":     category,
                    "country":      metadata.get("country", ""),
                    "chunk_index":  idx,
                    "total_chunks": total,
                    "record_id":    str(metadata.get("record_id", "")),
                    "record_type":  metadata.get("record_type", ""),
                    **{
                        k: v
                        for k, v in metadata.items()
                        if k not in {
                            "scraped_at", "category", "country",
                            "chunk_index", "total_chunks", "record_id", "record_type",
                        }
                    },
                },
            )
            documents.append(doc)

        self.log.debug(
            "chunk_text_done",
            source_url=source_url,
            input_tokens=len(full_tokens),
            chunks_produced=total,
        )
        return documents

    # ── DB record chunking ─────────────────────────────────────────────────────

    async def chunk_all_db_records(self, db_session) -> list[Document]:
        """
        Fetch every Scholarship and VisaRequirement record from PostgreSQL
        and chunk them all, returning a flat list of Documents ready for
        embedding.

        Args:
            db_session: An async SQLAlchemy AsyncSession.

        Returns:
            Combined list of Documents from all record types.
        """
        from sqlalchemy import select
        from app.models.database import Scholarship, VisaRequirement

        all_documents: list[Document] = []

        # ── Scholarships ──────────────────────────────────────────────────────
        self.log.info("chunk_db_fetch_scholarships")
        result       = await db_session.execute(
            select(Scholarship).where(Scholarship.is_active == True)
        )
        scholarships = result.scalars().all()
        self.log.info("chunk_db_scholarships_found", count=len(scholarships))

        for record in scholarships:
            text = self._scholarship_to_text(record)
            docs = self.chunk_text(
                text=text,
                source_url=record.application_url or "",
                metadata={
                    "category":     "scholarship",
                    "country":      ", ".join(record.target_countries or []),
                    "record_id":    record.id,
                    "record_type":  "scholarship",
                    "name":         record.name,
                    "provider":     record.provider,
                    "degree_level": record.degree_level,
                    "scraped_at":   record.updated_at.isoformat() if record.updated_at else "",
                },
            )
            all_documents.extend(docs)

        # ── Visa Requirements ─────────────────────────────────────────────────
        self.log.info("chunk_db_fetch_visa_requirements")
        result = await db_session.execute(select(VisaRequirement))
        visas  = result.scalars().all()
        self.log.info("chunk_db_visas_found", count=len(visas))

        for record in visas:
            text = self._visa_to_text(record)
            docs = self.chunk_text(
                text=text,
                source_url=record.official_url or "",
                metadata={
                    "category":     "visa",
                    "country":      record.to_country,
                    "record_id":    record.id,
                    "record_type":  "visa_requirement",
                    "visa_type":    record.visa_type,
                    "from_country": record.from_country,
                    "to_country":   record.to_country,
                    "scraped_at":   record.updated_at.isoformat() if record.updated_at else "",
                },
            )
            all_documents.extend(docs)

        self.log.info(
            "chunk_all_db_records_done",
            scholarships=len(scholarships),
            visas=len(visas),
            total_chunks=len(all_documents),
        )
        return all_documents

    # ── Record → Text serialisers ──────────────────────────────────────────────

    @staticmethod
    def _scholarship_to_text(record) -> str:
        """
        Serialise a Scholarship ORM record into a rich, readable text block.
        Structured prose outperforms JSON for semantic embeddings.
        """
        parts = [
            f"Scholarship: {record.name}",
            f"Provider: {record.provider}",
        ]
        if record.target_countries:
            parts.append(f"Available in: {', '.join(record.target_countries)}")
        if record.eligible_nationalities:
            parts.append(f"Open to nationalities: {', '.join(record.eligible_nationalities)}")
        if record.degree_level:
            parts.append(f"Degree level: {record.degree_level}")
        if record.deadline:
            parts.append(f"Application deadline: {record.deadline}")
        if record.amount_usd:
            parts.append(f"Award amount: USD {record.amount_usd:,.0f} per year")
        if record.application_url:
            parts.append(f"Apply at: {record.application_url}")
        if record.description:
            parts.append(f"\nDescription:\n{record.description}")
        return "\n".join(parts)

    @staticmethod
    def _visa_to_text(record) -> str:
        """
        Serialise a VisaRequirement ORM record into readable text.
        Documents list is critical — students ask "do I need X for Y visa?"
        """
        parts = [
            f"Visa Type: {record.visa_type}",
            f"Destination Country: {record.to_country}",
        ]
        if record.from_country and record.from_country.lower() != "all":
            parts.append(f"Applicable to applicants from: {record.from_country}")
        else:
            parts.append("Applicable to: All nationalities")
        if record.processing_time:
            parts.append(f"Processing time: {record.processing_time}")
        if record.fee_usd:
            parts.append(f"Application fee: USD {record.fee_usd:.2f}")
        if record.required_documents:
            docs_text = "\n  - ".join(record.required_documents)
            parts.append(f"\nRequired documents:\n  - {docs_text}")
        if record.official_url:
            parts.append(f"\nOfficial source: {record.official_url}")
        return "\n".join(parts)
