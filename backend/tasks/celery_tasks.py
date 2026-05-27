"""
GlobalPath AI — Celery Tasks & Beat Schedule
=============================================
Defines all background tasks and their periodic schedules.

Tasks:
  run_scholarship_scrape   — scrape ScholarshipDb.net, upsert to PostgreSQL
  run_visa_scrape          — scrape all 5 official visa portals, upsert results

Beat Schedule:
  run_scholarship_scrape   every 7 days  (scholarships change infrequently)
  run_visa_scrape          every 3 days  (visa fees / requirements change more often)

Broker & Backend:
  Upstash Redis via REST-compatible URL from UPSTASH_REDIS_REST_URL.
  Upstash supports the standard Redis protocol on port 6379, so we use the
  redis:// scheme with the REST token as the password.
"""

from __future__ import annotations

import asyncio
import os
from datetime import timedelta
from typing import Any

import structlog
from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_ready
from dotenv import load_dotenv
from sqlalchemy.dialects.postgresql import insert as pg_insert

load_dotenv()

log = structlog.get_logger(__name__)

# ─── Celery App Configuration ─────────────────────────────────────────────────

def _build_redis_url() -> str:
    """
    Construct a Redis connection URL for Upstash from environment variables.

    Upstash provides:
      UPSTASH_REDIS_REST_URL   → https://my-db.upstash.io
      UPSTASH_REDIS_REST_TOKEN → AXyzABC...

    Celery needs the standard redis:// scheme:
      redis://default:<token>@<host>:6379
    """
    rest_url   = os.getenv("UPSTASH_REDIS_REST_URL", "")
    rest_token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")

    # If a full redis:// URL is already provided (e.g. CELERY_BROKER_URL), use it
    celery_broker = os.getenv("CELERY_BROKER_URL", "")
    if celery_broker.startswith("redis://"):
        return celery_broker

    if not rest_url or not rest_token:
        raise RuntimeError(
            "Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL "
            "and UPSTASH_REDIS_REST_TOKEN in your .env file."
        )

    # Strip protocol prefix from the REST URL to get the hostname
    host = rest_url.replace("https://", "").replace("http://", "").rstrip("/")
    return f"redis://default:{rest_token}@{host}:6379"


_BROKER_URL = _build_redis_url()
_BACKEND_URL = os.getenv("CELERY_RESULT_BACKEND", _BROKER_URL)

celery_app = Celery(
    "globalpath_tasks",
    broker=_BROKER_URL,
    backend=_BACKEND_URL,
)

celery_app.conf.update(
    # ── Serialisation ──────────────────────────────────────────────────────
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # ── Timezone ───────────────────────────────────────────────────────────
    timezone="UTC",
    enable_utc=True,

    # ── Task Behaviour ─────────────────────────────────────────────────────
    task_track_started=True,
    task_acks_late=True,        # only acknowledge after the task completes
    worker_prefetch_multiplier=1,  # one task at a time per worker (memory-safe for scrapers)
    task_reject_on_worker_lost=True,

    # ── Result Expiry ──────────────────────────────────────────────────────
    result_expires=timedelta(days=1),

    # ── Retry defaults ─────────────────────────────────────────────────────
    task_max_retries=3,
    task_default_retry_delay=60,   # 60 seconds between retries

    # ── Upstash Redis visibility timeout ───────────────────────────────────
    # Must be longer than the longest expected task execution time
    broker_transport_options={
        "visibility_timeout": 86400,   # 24 hours — scrapers can be slow
        "socket_timeout":     30,
        "socket_connect_timeout": 30,
    },

    # ── Beat Schedule ──────────────────────────────────────────────────────
    beat_schedule={
        "scrape-scholarships-weekly": {
            "task":     "app.tasks.celery_tasks.run_scholarship_scrape",
            "schedule": crontab(hour=2, minute=0, day_of_week=1),  # Every Monday at 02:00 UTC
            "options":  {"expires": 3600 * 6},  # discard if not picked up within 6 hours
        },
        "scrape-visas-every-3-days": {
            "task":     "app.tasks.celery_tasks.run_visa_scrape",
            "schedule": crontab(hour=3, minute=0, day_of_week="*/3"),  # Every 3 days at 03:00 UTC
            "options":  {"expires": 3600 * 6},
        },
    },

    # ── Routing (optional — keeps scraping tasks on a dedicated queue) ──────
    task_routes={
        "app.tasks.celery_tasks.run_scholarship_scrape": {"queue": "scraping"},
        "app.tasks.celery_tasks.run_visa_scrape":        {"queue": "scraping"},
    },
)


# ─── Database Helper ──────────────────────────────────────────────────────────

def _get_sync_db_session():
    """
    Return a synchronous SQLAlchemy session for use inside Celery tasks.
    Celery workers run in a non-async context, so we use the sync engine.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    db_url = os.getenv("DATABASE_URL", "")
    # Ensure we use the sync psycopg2 driver (not asyncpg)
    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    engine = create_engine(
        sync_url,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=4,
    )
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    return Session()


def _upsert_records_sync(
    session,
    model,
    records: list[dict[str, Any]],
    conflict_column: str,
) -> int:
    """
    Synchronous upsert helper used inside Celery tasks.

    Args:
        session:         SQLAlchemy Session (sync).
        model:           ORM model class.
        records:         List of dicts to upsert.
        conflict_column: Unique column used for conflict detection.

    Returns:
        Number of rows processed.
    """
    if not records:
        return 0

    stmt = pg_insert(model).values(records)
    update_cols = {
        c.name: c
        for c in stmt.excluded
        if c.name not in ("id", "created_at", conflict_column)
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=[conflict_column],
        set_=update_cols,
    )

    session.execute(stmt)
    session.commit()
    return len(records)


# ─── Task: Scholarship Scrape ─────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.celery_tasks.run_scholarship_scrape",
    bind=True,
    max_retries=3,
    default_retry_delay=300,   # 5 minutes between retries
    soft_time_limit=3600,      # 1 hour soft limit (raises SoftTimeLimitExceeded)
    time_limit=4200,           # 70-minute hard limit
)
def run_scholarship_scrape(self) -> dict[str, Any]:
    """
    Celery task: scrape ScholarshipDb.net and upsert results to PostgreSQL.

    Scheduled: every Monday at 02:00 UTC (configurable in beat_schedule above).

    Returns:
        dict with keys: status, scraped, upserted, task_id, errors
    """
    from app.scrapers.scholarship_scraper import ScholarshipScraper
    from app.models.database import Scholarship

    task_id = self.request.id
    log.info("scholarship_scrape_start", task_id=task_id)

    db_session = None
    try:
        # Run the async scraper in a fresh event loop
        scraper = ScholarshipScraper(db_session=None)
        records: list[dict[str, Any]] = asyncio.run(scraper.run())

        log.info("scholarship_scrape_fetched", count=len(records), task_id=task_id)

        # Persist to PostgreSQL
        db_session = _get_sync_db_session()
        upserted = _upsert_records_sync(
            db_session,
            Scholarship,
            records,
            conflict_column="application_url",
        )

        log.info(
            "scholarship_scrape_complete",
            scraped=len(records),
            upserted=upserted,
            task_id=task_id,
        )
        return {
            "status":  "success",
            "scraped": len(records),
            "upserted": upserted,
            "task_id": task_id,
            "errors":  [],
        }

    except Exception as exc:
        log.error(
            "scholarship_scrape_error",
            error=str(exc),
            task_id=task_id,
            retry_count=self.request.retries,
        )
        try:
            # Exponential backoff: 5 min, 10 min, 20 min
            raise self.retry(
                exc=exc,
                countdown=300 * (2 ** self.request.retries),
            )
        except self.MaxRetriesExceededError:
            log.error("scholarship_scrape_max_retries_exceeded", task_id=task_id)
            return {
                "status":  "failed",
                "scraped": 0,
                "upserted": 0,
                "task_id": task_id,
                "errors":  [str(exc)],
            }
    finally:
        if db_session:
            db_session.close()


# ─── Task: Visa Scrape ────────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.celery_tasks.run_visa_scrape",
    bind=True,
    max_retries=3,
    default_retry_delay=180,   # 3 minutes between retries
    soft_time_limit=1800,      # 30-minute soft limit
    time_limit=2400,           # 40-minute hard limit
)
def run_visa_scrape(self) -> dict[str, Any]:
    """
    Celery task: scrape official visa portals for all 5 destination countries
    and upsert results to PostgreSQL.

    Scheduled: every 3 days at 03:00 UTC.

    Returns:
        dict with keys: status, scraped, upserted, countries, task_id, errors
    """
    from app.scrapers.visa_scraper import VisaScraper
    from app.models.database import VisaRequirement

    task_id = self.request.id
    log.info("visa_scrape_start", task_id=task_id)

    db_session = None
    errors: list[str] = []

    try:
        scraper = VisaScraper(db_session=None)
        records: list[dict[str, Any]] = asyncio.run(scraper.run())

        scraped_countries = [r.get("to_country", "?") for r in records]
        log.info(
            "visa_scrape_fetched",
            count=len(records),
            countries=scraped_countries,
            task_id=task_id,
        )

        # Persist to PostgreSQL
        db_session = _get_sync_db_session()
        upserted = _upsert_records_sync(
            db_session,
            VisaRequirement,
            records,
            conflict_column="official_url",
        )

        log.info(
            "visa_scrape_complete",
            scraped=len(records),
            upserted=upserted,
            countries=scraped_countries,
            task_id=task_id,
        )
        return {
            "status":    "success",
            "scraped":   len(records),
            "upserted":  upserted,
            "countries": scraped_countries,
            "task_id":   task_id,
            "errors":    errors,
        }

    except Exception as exc:
        log.error(
            "visa_scrape_error",
            error=str(exc),
            task_id=task_id,
            retry_count=self.request.retries,
        )
        try:
            raise self.retry(
                exc=exc,
                countdown=180 * (2 ** self.request.retries),
            )
        except self.MaxRetriesExceededError:
            log.error("visa_scrape_max_retries_exceeded", task_id=task_id)
            return {
                "status":    "failed",
                "scraped":   0,
                "upserted":  0,
                "countries": [],
                "task_id":   task_id,
                "errors":    [str(exc)],
            }
    finally:
        if db_session:
            db_session.close()


# ─── Utility Tasks ────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.celery_tasks.health_check")
def health_check() -> dict[str, str]:
    """
    Lightweight ping task — confirms the Celery worker and broker are operational.
    Useful for monitoring dashboards and uptime checks.
    """
    return {"status": "ok", "worker": "globalpath_tasks"}


@celery_app.task(name="app.tasks.celery_tasks.run_all_scrapes")
def run_all_scrapes() -> dict[str, Any]:
    """
    Convenience task that triggers both scraping tasks in sequence.
    Useful for initial setup or manual full-refresh runs.

    Usage from Python:
        from app.tasks.celery_tasks import run_all_scrapes
        run_all_scrapes.delay()
    """
    log.info("run_all_scrapes_start")

    scholarship_result = run_scholarship_scrape.apply()
    visa_result        = run_visa_scrape.apply()

    return {
        "scholarship_scrape": scholarship_result.result,
        "visa_scrape":        visa_result.result,
    }


# ─── Worker Startup Signal ────────────────────────────────────────────────────

@worker_ready.connect
def on_worker_ready(sender, **kwargs):
    """
    Emitted when a Celery worker starts and is ready to accept tasks.
    Log the available queues so we can confirm configuration on startup.
    """
    log.info(
        "celery_worker_ready",
        queues=list(sender.app.amqp.queues.keys()) if hasattr(sender.app, "amqp") else [],
    )
