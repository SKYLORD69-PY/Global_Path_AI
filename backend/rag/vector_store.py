"""
GlobalPath AI — ChromaDB Vector Store
========================================
Persistent, embedded ChromaDB collection for storing and querying
scholarship + visa knowledge embeddings.

No server required — ChromaDB runs inside the Python process and
persists its index to disk at ./data/chroma_db.

Collection name : globalpath-knowledge
Embedding dim   : 384  (all-MiniLM-L6-v2)
Distance metric : cosine  (best for normalised sentence embeddings)

Usage:
    store   = ChromaVectorStore()
    store.upsert_embeddings(embedded_chunks)

    results = store.query(
        query_text    = "scholarship for Indian students in Germany",
        embedder      = embedder,
        top_k         = 8,
        filter_metadata = {"category": "scholarship", "country": "Germany"},
    )
"""

from __future__ import annotations

import hashlib
import os
from typing import Any

import chromadb
from chromadb import Settings as ChromaSettings
from chromadb.api.models.Collection import Collection
import structlog

from .embedder import Embedder

log = structlog.get_logger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

COLLECTION_NAME    = "globalpath-knowledge"
DEFAULT_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./data/chroma_db")
DEFAULT_TOP_K      = 8

# Fields that can be used as ChromaDB $eq / $in where-clause filters
FILTERABLE_FIELDS = frozenset(["category", "country", "record_type", "visa_type", "degree_level"])


# ─── ChromaVectorStore ────────────────────────────────────────────────────────

class ChromaVectorStore:
    """
    Manages a single ChromaDB collection for the GlobalPath knowledge base.

    ChromaDB stores three things per document:
      1. The raw text (as "document")
      2. The pre-computed embedding vector
      3. Metadata dict for filtering

    We pre-compute embeddings with our Embedder class and pass them directly
    so ChromaDB never needs to call any embedding function itself.
    """

    def __init__(self, persist_dir: str = DEFAULT_PERSIST_DIR) -> None:
        self.persist_dir = persist_dir
        self._client: chromadb.PersistentClient | None = None
        self._collection: Collection | None = None
        self.log = structlog.get_logger(component="ChromaVectorStore")

    # ── Client + Collection Initialisation ────────────────────────────────────

    def _get_client(self) -> chromadb.PersistentClient:
        """Return (or lazily create) the persistent ChromaDB client."""
        if self._client is None:
            os.makedirs(self.persist_dir, exist_ok=True)
            self._client = chromadb.PersistentClient(
                path=self.persist_dir,
                settings=ChromaSettings(
                    anonymized_telemetry=False,   # no usage stats sent to Chroma
                    allow_reset=True,
                ),
            )
            self.log.info("chroma_client_ready", persist_dir=self.persist_dir)
        return self._client

    def _get_collection(self) -> Collection:
        """
        Return (or lazily create) the globalpath-knowledge collection.
        Uses cosine distance — correct for L2-normalised sentence embeddings.
        """
        if self._collection is None:
            client = self._get_client()
            self._collection = client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"},
            )
            count = self._collection.count()
            self.log.info(
                "collection_ready",
                name=COLLECTION_NAME,
                existing_documents=count,
            )
        return self._collection

    # ── ID generation ─────────────────────────────────────────────────────────

    @staticmethod
    def _make_doc_id(chunk_text: str, metadata: dict) -> str:
        """
        Generate a stable, deterministic document ID from content + position.
        Using a hash ensures that re-running the pipeline with the same data
        produces identical IDs, making upsert idempotent.
        """
        source   = metadata.get("source_url", "")
        idx      = metadata.get("chunk_index", 0)
        rec_id   = metadata.get("record_id", "")
        raw      = f"{source}|{rec_id}|{idx}|{chunk_text[:64]}"
        return hashlib.sha256(raw.encode()).hexdigest()[:32]

    # ── Metadata sanitisation ──────────────────────────────────────────────────

    @staticmethod
    def _sanitise_metadata(meta: dict[str, Any]) -> dict[str, Any]:
        """
        ChromaDB metadata values must be str, int, float, or bool.
        Convert lists → comma-joined strings, None → "".
        Drop keys with unsupported value types.
        """
        clean: dict[str, Any] = {}
        for k, v in meta.items():
            if isinstance(v, (str, int, float, bool)):
                clean[k] = v
            elif isinstance(v, list):
                clean[k] = ", ".join(str(i) for i in v)
            elif v is None:
                clean[k] = ""
            # skip dicts, objects, etc.
        return clean

    # ── Upsert ────────────────────────────────────────────────────────────────

    def upsert_embeddings(
        self,
        embedded_chunks: list[dict[str, Any]],
        batch_size: int = 500,
    ) -> int:
        """
        Upsert pre-computed embeddings into ChromaDB in batches.

        Uses "upsert" (not "add") so the function is idempotent — running
        the seed script twice won't create duplicate documents.

        Args:
            embedded_chunks: Output of Embedder.embed_chunks().
                             Each element must have keys:
                             "chunk_text", "embedding", "metadata".
            batch_size:      Number of documents per ChromaDB API call.
                             500 is a safe default for memory-constrained envs.

        Returns:
            Total number of documents upserted.

        Raises:
            ValueError: if embedded_chunks is empty or malformed.
        """
        if not embedded_chunks:
            self.log.warning("upsert_skip", reason="empty embedded_chunks")
            return 0

        collection = self._get_collection()
        total      = len(embedded_chunks)
        upserted   = 0

        self.log.info("upsert_start", total=total, batch_size=batch_size)

        for batch_start in range(0, total, batch_size):
            batch = embedded_chunks[batch_start : batch_start + batch_size]

            ids        = []
            documents  = []
            embeddings = []
            metadatas  = []

            for item in batch:
                chunk_text = item.get("chunk_text", "")
                embedding  = item.get("embedding", [])
                metadata   = item.get("metadata", {})

                if not chunk_text or not embedding:
                    self.log.warning("upsert_skip_item", reason="missing chunk_text or embedding")
                    continue

                doc_id = self._make_doc_id(chunk_text, metadata)
                ids.append(doc_id)
                documents.append(chunk_text)
                embeddings.append(embedding)
                metadatas.append(self._sanitise_metadata(metadata))

            if ids:
                collection.upsert(
                    ids=ids,
                    documents=documents,
                    embeddings=embeddings,
                    metadatas=metadatas,
                )
                upserted += len(ids)
                self.log.debug(
                    "upsert_batch_done",
                    batch_start=batch_start,
                    batch_size=len(ids),
                    total_so_far=upserted,
                )

        self.log.info("upsert_complete", upserted=upserted, collection_total=collection.count())
        return upserted

    # ── Query ─────────────────────────────────────────────────────────────────

    def query(
        self,
        query_text:      str,
        embedder:        Embedder,
        top_k:           int               = DEFAULT_TOP_K,
        filter_metadata: dict[str, Any]    = None,
    ) -> list[dict[str, Any]]:
        """
        Embed the query locally, then retrieve the top-k most similar chunks.

        Args:
            query_text:      The user's natural-language question.
            embedder:        Embedder instance used to vectorise the query.
            top_k:           Maximum number of results to return.
            filter_metadata: Optional dict of exact-match filters.
                             Supported keys: category, country, record_type,
                             visa_type, degree_level.
                             Example: {"category": "visa", "country": "Germany"}

        Returns:
            List of dicts sorted by relevance (highest first):
            [
                {
                    "text":     str,           # the chunk text
                    "metadata": dict,          # original metadata
                    "score":    float,         # cosine distance (lower = closer)
                    "id":       str,           # ChromaDB document ID
                },
                ...
            ]
        """
        if not query_text or not query_text.strip():
            self.log.warning("query_empty_text")
            return []

        collection = self._get_collection()

        # ── Build ChromaDB where clause ───────────────────────────────────────
        where_clause = self._build_where_clause(filter_metadata or {})

        # ── Embed the query locally ───────────────────────────────────────────
        query_embedding = embedder.embed_query(query_text.strip())

        self.log.info(
            "query_start",
            query=query_text[:80],
            top_k=top_k,
            filters=where_clause,
        )

        # ── ChromaDB similarity search ────────────────────────────────────────
        query_kwargs: dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results":        min(top_k, collection.count() or 1),
            "include":          ["documents", "metadatas", "distances"],
        }
        if where_clause:
            query_kwargs["where"] = where_clause

        try:
            raw = collection.query(**query_kwargs)
        except Exception as exc:
            self.log.error("query_error", error=str(exc))
            return []

        # ── Unpack results ────────────────────────────────────────────────────
        results: list[dict[str, Any]] = []
        ids        = raw.get("ids", [[]])[0]
        documents  = raw.get("documents", [[]])[0]
        metadatas  = raw.get("metadatas", [[]])[0]
        distances  = raw.get("distances", [[]])[0]

        for doc_id, doc_text, meta, distance in zip(ids, documents, metadatas, distances):
            results.append({
                "text":     doc_text,
                "metadata": meta,
                "score":    round(1 - distance, 4),   # convert distance → similarity
                "id":       doc_id,
            })

        self.log.info("query_done", results_returned=len(results))
        return results

    # ── Where clause builder ──────────────────────────────────────────────────

    @staticmethod
    def _build_where_clause(filter_metadata: dict[str, Any]) -> dict | None:
        """
        Convert a simple key→value filter dict into a ChromaDB where clause.

        Single filter  : {"category": "visa"}
                       → {"category": {"$eq": "visa"}}

        Multiple filters: {"category": "visa", "country": "Germany"}
                        → {"$and": [{"category": {"$eq": "visa"}},
                                    {"country": {"$eq": "Germany"}}]}

        List values    : {"country": ["Germany", "Canada"]}
                       → {"country": {"$in": ["Germany", "Canada"]}}

        Unknown keys are silently ignored to avoid ChromaDB errors.
        """
        clauses: list[dict] = []

        for key, value in filter_metadata.items():
            if key not in FILTERABLE_FIELDS:
                continue
            if isinstance(value, list):
                clauses.append({key: {"$in": [str(v) for v in value]}})
            elif isinstance(value, str) and value:
                clauses.append({key: {"$eq": value}})

        if not clauses:
            return None
        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    # ── Collection management ─────────────────────────────────────────────────

    def delete_collection(self) -> None:
        """
        Drop and recreate the collection — useful before a fresh scrape run
        to ensure stale data is removed.

        ⚠️  This is irreversible. All stored embeddings will be lost.
        Call seed_vector_db.py afterwards to repopulate.
        """
        client = self._get_client()
        try:
            client.delete_collection(COLLECTION_NAME)
            self.log.info("collection_deleted", name=COLLECTION_NAME)
        except Exception as exc:
            self.log.warning("collection_delete_error", error=str(exc))
        finally:
            self._collection = None

    def collection_stats(self) -> dict[str, Any]:
        """Return basic stats about the current collection."""
        collection = self._get_collection()
        count      = collection.count()
        return {
            "collection_name":  COLLECTION_NAME,
            "persist_dir":      self.persist_dir,
            "document_count":   count,
        }
