"""
GlobalPath AI — Local Embedder
================================
Generates dense vector embeddings using sentence-transformers running
entirely locally on CPU — zero API calls, zero cost, zero rate limits.

Model : all-MiniLM-L6-v2
  - Output dimensions : 384
  - Max input tokens  : 256  (text longer than this is automatically truncated
                               by the model — our chunker keeps chunks ≤ 500 tks
                               which maps to roughly 200–250 model tokens)
  - Speed             : ~2,000–8,000 sentences/sec on CPU depending on hardware
  - Model size        : ~90 MB (downloaded once, cached in ~/.cache/huggingface/)
  - License           : Apache 2.0

The model is downloaded automatically on first instantiation.  Subsequent
runs load it from the local Hugging Face cache (~/.cache/huggingface/hub/).

Usage:
    embedder = Embedder()
    results  = embedder.embed_chunks(documents)
    # results[0] = {"chunk_text": "...", "embedding": [0.12, -0.04, ...], "metadata": {...}}
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np
import structlog
from langchain_core.documents import Document
from sentence_transformers import SentenceTransformer

log = structlog.get_logger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

MODEL_NAME    = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
BATCH_SIZE    = 64      # optimal for CPU — fits comfortably in RAM without OOM
NORMALIZE     = True    # L2-normalise so cosine similarity == dot product


# ─── Embedder ─────────────────────────────────────────────────────────────────

class Embedder:
    """
    Wraps sentence-transformers SentenceTransformer for batch embedding
    of LangChain Document chunks.

    The model is loaded lazily on first call to embed_chunks() or
    embed_query() so import time stays fast.

    Thread safety: SentenceTransformer is not thread-safe for encode().
    Use one Embedder instance per process/worker (the default Celery
    worker model with worker_prefetch_multiplier=1 satisfies this).
    """

    def __init__(self, model_name: str = MODEL_NAME, batch_size: int = BATCH_SIZE) -> None:
        self.model_name  = model_name
        self.batch_size  = batch_size
        self._model: SentenceTransformer | None = None
        self.log         = structlog.get_logger(component="Embedder", model=model_name)

    # ── Lazy model loader ──────────────────────────────────────────────────────

    def _get_model(self) -> SentenceTransformer:
        """
        Load the SentenceTransformer model on first call.
        Subsequent calls return the cached instance instantly.
        """
        if self._model is None:
            self.log.info("model_loading", model=self.model_name)
            t0           = time.perf_counter()
            self._model  = SentenceTransformer(self.model_name)
            elapsed      = time.perf_counter() - t0
            self.log.info(
                "model_loaded",
                model=self.model_name,
                load_time_s=round(elapsed, 2),
                embedding_dim=self._model.get_sentence_embedding_dimension(),
            )
        return self._model

    # ── Core embedding ─────────────────────────────────────────────────────────

    def embed_chunks(
        self,
        chunks: list[Document],
    ) -> list[dict[str, Any]]:
        """
        Embed a list of LangChain Documents in batches.

        Each Document's page_content is embedded. The resulting vector,
        the original text, and all metadata are returned together in a
        flat dict — ready to be passed directly to ChromaVectorStore.upsert().

        Args:
            chunks: List of LangChain Documents (output of DocumentChunker).

        Returns:
            List of dicts, one per input chunk:
            [
                {
                    "chunk_text": str,           # original page_content
                    "embedding":  list[float],   # 384-dim vector
                    "metadata":   dict,          # all Document.metadata fields
                },
                ...
            ]

        Raises:
            ValueError: if chunks is empty.
        """
        if not chunks:
            raise ValueError("embed_chunks() called with an empty list.")

        model = self._get_model()
        texts = [doc.page_content for doc in chunks]
        total = len(texts)

        self.log.info("embed_start", total_chunks=total, batch_size=self.batch_size)
        t0 = time.perf_counter()

        all_embeddings: list[np.ndarray] = []

        for batch_start in range(0, total, self.batch_size):
            batch_end   = min(batch_start + self.batch_size, total)
            batch_texts = texts[batch_start:batch_end]

            batch_vecs = model.encode(
                batch_texts,
                batch_size=self.batch_size,
                normalize_embeddings=NORMALIZE,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
            all_embeddings.extend(batch_vecs)

            self.log.debug(
                "embed_batch_done",
                batch=f"{batch_start}–{batch_end}",
                remaining=total - batch_end,
            )

        elapsed = time.perf_counter() - t0
        self.log.info(
            "embed_complete",
            total_chunks=total,
            elapsed_s=round(elapsed, 2),
            throughput=round(total / elapsed, 1),
        )

        results: list[dict[str, Any]] = []
        for doc, vec in zip(chunks, all_embeddings):
            results.append({
                "chunk_text": doc.page_content,
                "embedding":  vec.tolist(),        # ChromaDB expects plain Python floats
                "metadata":   dict(doc.metadata),  # shallow copy — safe to mutate
            })

        return results

    def embed_query(self, query_text: str) -> list[float]:
        """
        Embed a single query string for retrieval.

        Uses the same model and normalisation as embed_chunks() so that
        cosine similarity between a query vector and a stored chunk vector
        is computed in the same space.

        Args:
            query_text: The user's raw question or search string.

        Returns:
            384-dimensional embedding as a list of floats.
        """
        if not query_text or not query_text.strip():
            raise ValueError("embed_query() called with empty query text.")

        model = self._get_model()
        vec   = model.encode(
            query_text.strip(),
            normalize_embeddings=NORMALIZE,
            convert_to_numpy=True,
        )
        return vec.tolist()

    # ── Similarity utility ─────────────────────────────────────────────────────

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        """
        Compute cosine similarity between two embedding vectors.
        Because both vectors are L2-normalised, this is equivalent to dot product.
        Returns a float in [-1, 1]; higher = more similar.
        """
        va = np.array(a, dtype=np.float32)
        vb = np.array(b, dtype=np.float32)
        denom = np.linalg.norm(va) * np.linalg.norm(vb)
        if denom == 0:
            return 0.0
        return float(np.dot(va, vb) / denom)

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def embedding_dimension(self) -> int:
        """Return the output dimension of the loaded model."""
        return self._get_model().get_sentence_embedding_dimension() or EMBEDDING_DIM

    @property
    def is_loaded(self) -> bool:
        """True if the model has been loaded into memory."""
        return self._model is not None
