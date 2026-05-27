"""
GlobalPath AI — Vector DB Seed Script
=======================================
One-time (and re-runnable) script that:

  1. Connects to PostgreSQL
  2. Fetches all Scholarship + VisaRequirement records
  3. Chunks them with DocumentChunker
  4. Embeds them locally with Embedder (all-MiniLM-L6-v2, no API key)
  5. Upserts everything into ChromaDB

Safe to re-run — upsert is idempotent. Use --reset to wipe the
collection first (e.g. after a full re-scrape).

Usage:
    # Normal run (adds / updates records, keeps existing)
    python -m backend.tasks.seed_vector_db

    # Full reset — drops collection, re-embeds everything from scratch
    python -m backend.tasks.seed_vector_db --reset

    # Dry run — counts records without writing to ChromaDB
    python -m backend.tasks.seed_vector_db --dry-run

    # Seed only one category
    python -m backend.tasks.seed_vector_db --category visa
    python -m backend.tasks.seed_vector_db --category scholarship
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from typing import Any

import structlog
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()

log = structlog.get_logger(script="seed_vector_db")

# ─── Progress printer ─────────────────────────────────────────────────────────

def _section(title: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


# ─── Core seeding logic ───────────────────────────────────────────────────────

async def seed(
    reset:    bool = False,
    dry_run:  bool = False,
    category: str  = "all",
) -> dict[str, Any]:
    """
    Full pipeline: DB → chunks → embeddings → ChromaDB.

    Args:
        reset:    If True, delete the ChromaDB collection before seeding.
        dry_run:  If True, run all steps except the final ChromaDB upsert.
        category: "all", "scholarship", or "visa".

    Returns:
        Summary dict with record counts and timing info.
    """
    # ── Lazy imports (avoids loading heavy libs on --help) ────────────────────
    from app.models.database import AsyncSessionLocal, create_tables
    from app.rag.chunker      import DocumentChunker
    from app.rag.embedder     import Embedder
    from app.rag.vector_store import ChromaVectorStore

    summary: dict[str, Any] = {
        "scholarships_found": 0,
        "visas_found":        0,
        "total_chunks":       0,
        "total_embedded":     0,
        "total_upserted":     0,
        "elapsed_s":          0.0,
        "dry_run":            dry_run,
    }

    t_start = time.perf_counter()

    # ── Step 0: Ensure tables exist ───────────────────────────────────────────
    _section("Step 0 — Ensuring database tables exist")
    await create_tables()
    print("  ✓ Tables verified")

    # ── Step 0.5: Optionally reset ChromaDB ───────────────────────────────────
    store = ChromaVectorStore()

    if reset:
        _section("Step 0.5 — Resetting ChromaDB collection")
        if dry_run:
            print("  ⚠  --dry-run: skipping reset")
        else:
            store.delete_collection()
            print("  ✓ Collection dropped and will be recreated on first upsert")

    # ── Step 1: Fetch + chunk DB records ──────────────────────────────────────
    _section("Step 1 — Chunking database records")
    chunker = DocumentChunker()

    async with AsyncSessionLocal() as db:
        all_chunks = await chunker.chunk_all_db_records(db)

    # Apply category filter if requested
    if category != "all":
        all_chunks = [c for c in all_chunks if c.metadata.get("category") == category]
        print(f"  ℹ  Filtered to category='{category}': {len(all_chunks)} chunks")

    total_chunks = len(all_chunks)
    summary["total_chunks"] = total_chunks

    if total_chunks == 0:
        print("\n  ⚠  No chunks produced. Is the database populated?")
        print("     Run the scrapers first: celery -A app.tasks.celery_tasks worker")
        return summary

    # Count by category for the progress report
    cat_counts: dict[str, int] = {}
    for chunk in all_chunks:
        cat = chunk.metadata.get("category", "unknown")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    print(f"\n  Total chunks produced: {total_chunks:,}")
    for cat, count in sorted(cat_counts.items()):
        print(f"    {cat:<20}: {count:,}")

    if dry_run:
        print("\n  ⚠  --dry-run: stopping before embedding")
        summary["elapsed_s"] = round(time.perf_counter() - t_start, 2)
        return summary

    # ── Step 2: Embed chunks ──────────────────────────────────────────────────
    _section("Step 2 — Generating embeddings (all-MiniLM-L6-v2, local CPU)")
    print("  Loading model from HuggingFace cache (first run downloads ~90 MB)...")

    embedder        = Embedder()
    batch_size      = 64
    total_batches   = (total_chunks + batch_size - 1) // batch_size
    all_embedded:   list[dict[str, Any]] = []

    with tqdm(
        total=total_chunks,
        desc="  Embedding",
        unit="chunk",
        ncols=72,
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]",
    ) as pbar:
        for batch_start in range(0, total_chunks, batch_size):
            batch_end    = min(batch_start + batch_size, total_chunks)
            batch_chunks = all_chunks[batch_start:batch_end]

            embedded_batch = embedder.embed_chunks(batch_chunks)
            all_embedded.extend(embedded_batch)

            pbar.update(len(batch_chunks))

    summary["total_embedded"] = len(all_embedded)
    print(f"\n  ✓ Embedded {len(all_embedded):,} chunks")

    # ── Step 3: Upsert to ChromaDB ────────────────────────────────────────────
    _section("Step 3 — Upserting to ChromaDB")

    upsert_batch_size = 500
    total_upserted    = 0
    upsert_batches    = (len(all_embedded) + upsert_batch_size - 1) // upsert_batch_size

    with tqdm(
        total=len(all_embedded),
        desc="  Upserting",
        unit="doc",
        ncols=72,
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]",
    ) as pbar:
        for batch_start in range(0, len(all_embedded), upsert_batch_size):
            batch_end    = min(batch_start + upsert_batch_size, len(all_embedded))
            batch        = all_embedded[batch_start:batch_end]

            n = store.upsert_embeddings(batch, batch_size=upsert_batch_size)
            total_upserted += n
            pbar.update(len(batch))

    summary["total_upserted"] = total_upserted

    # ── Step 4: Verify + summary ──────────────────────────────────────────────
    _section("Step 4 — Verification")
    stats = store.collection_stats()

    elapsed = time.perf_counter() - t_start
    summary["elapsed_s"] = round(elapsed, 2)

    print(f"  Collection : {stats['collection_name']}")
    print(f"  Persist dir: {stats['persist_dir']}")
    print(f"  Total docs : {stats['document_count']:,}")
    print(f"  Upserted   : {total_upserted:,}")
    print(f"  Elapsed    : {elapsed:.1f}s")

    return summary


# ─── Quick smoke-test query ───────────────────────────────────────────────────

async def smoke_test() -> None:
    """
    After seeding, run a quick retrieval to verify everything works end-to-end.
    """
    from app.rag.retriever import StudyAbroadRetriever

    _section("Smoke Test — Quick retrieval check")

    test_queries = [
        "What scholarships are available for Indian students in the UK?",
        "What documents do I need for a German student visa?",
        "How much does an Australian student visa cost?",
    ]

    retriever = StudyAbroadRetriever()

    for query in test_queries:
        print(f"\n  Query: {query!r}")
        context = retriever.retrieve(query)
        if context:
            first_block = context.split("\n\n")[0]
            print(f"  → {first_block[:200]}...")
        else:
            print("  → ⚠  No results returned")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed the GlobalPath AI ChromaDB vector store from PostgreSQL.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m backend.tasks.seed_vector_db
  python -m backend.tasks.seed_vector_db --reset
  python -m backend.tasks.seed_vector_db --dry-run
  python -m backend.tasks.seed_vector_db --category visa --reset
  python -m backend.tasks.seed_vector_db --smoke-test
        """,
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop the ChromaDB collection before seeding (full rebuild).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count and chunk records without writing to ChromaDB.",
    )
    parser.add_argument(
        "--category",
        choices=["all", "scholarship", "visa", "university"],
        default="all",
        help="Seed only records of this category (default: all).",
    )
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="After seeding, run 3 test queries to verify retrieval works.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    print("\n🌍  GlobalPath AI — Vector DB Seeder")
    print(f"    Reset     : {args.reset}")
    print(f"    Dry run   : {args.dry_run}")
    print(f"    Category  : {args.category}")
    print(f"    Smoke test: {args.smoke_test}")

    try:
        summary = await seed(
            reset=args.reset,
            dry_run=args.dry_run,
            category=args.category,
        )

        print("\n" + "═" * 60)
        print("  ✅  Seeding complete")
        print(f"     Chunks produced : {summary['total_chunks']:,}")
        print(f"     Chunks embedded : {summary['total_embedded']:,}")
        print(f"     Docs upserted   : {summary['total_upserted']:,}")
        print(f"     Elapsed         : {summary['elapsed_s']}s")
        print("═" * 60)

        if args.smoke_test and not args.dry_run:
            await smoke_test()

    except KeyboardInterrupt:
        print("\n\n  ⚠  Interrupted by user")
        sys.exit(1)
    except Exception as exc:
        log.exception("seed_failed", error=str(exc))
        print(f"\n  ❌  Seeding failed: {exc}")
        print("     Check your .env file and make sure PostgreSQL is reachable.")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
