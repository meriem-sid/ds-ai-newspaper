"""Stage 4a — PostgreSQL persistence (Neon / Supabase / any Postgres).

* apply_schema()  — runs db/schema.sql (idempotent)
* PgSeenStore     — the 30-day "already looked at" memory; same API as clean.LocalSeenStore
* save_edition()  — upserts today's edition and inserts its articles
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import psycopg

from .clean import SEEN_DAYS, normalize_title, normalize_url
from .config import ROOT
from .models import Article, Edition, RawItem

log = logging.getLogger("db")


def database_url() -> str | None:
    return os.getenv("DATABASE_URL") or None


def connect() -> psycopg.Connection:
    url = database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    # Neon computes scale to zero; the first connection can take a few seconds to wake it.
    # autocommit: reads never leave an idle transaction open (Neon kills those), and
    # multi-statement writes use explicit `with conn.transaction()` blocks.
    # Callers should open a connection per step, not hold one across the slow LLM stage.
    return psycopg.connect(url, connect_timeout=30, autocommit=True)


def apply_schema(conn: psycopg.Connection) -> None:
    with conn.transaction():
        conn.execute((ROOT / "db" / "schema.sql").read_text(encoding="utf-8"))


class PgSeenStore:
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn

    def load(self, days: int = SEEN_DAYS) -> tuple[set[str], list[str]]:
        rows = self.conn.execute(
            "SELECT url, title_norm FROM seen_items WHERE seen_at > NOW() - make_interval(days => %s)", (days,)
        ).fetchall()
        # Articles count as seen too (covers editions saved before seen_items existed).
        art = self.conn.execute(
            "SELECT url, title FROM articles WHERE created_at > NOW() - make_interval(days => %s)", (days,)
        ).fetchall()
        urls = {u for u, _ in rows} | {normalize_url(u) for u, _ in art}
        titles = [t for _, t in rows] + [normalize_title(t) for _, t in art]
        return urls, titles

    def record(self, items: list[RawItem], kept_urls: set[str]) -> None:
        rows = []
        for it in items:
            kept = normalize_url(str(it.url)) in kept_urls
            for url in [str(it.url), *it.related_urls]:
                rows.append((normalize_url(url), normalize_title(it.title), it.bucket, kept))
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO seen_items (url, title_norm, bucket, kept) VALUES (%s, %s, %s, %s)
                   ON CONFLICT (url) DO UPDATE SET seen_at = NOW(), kept = seen_items.kept OR EXCLUDED.kept""",
                rows,
            )
            cur.execute("DELETE FROM seen_items WHERE seen_at < NOW() - make_interval(days => %s)", (SEEN_DAYS,))


ARTICLE_COLUMNS = (
    "edition_id", "category", "title", "what_happened", "why_it_matters", "url", "source",
    "relevance_score", "deadline", "tags", "related_urls", "event_start", "event_timezone",
    "is_remote", "event_format", "job_level", "company", "location", "published_at",
)


def save_edition(conn: psycopg.Connection, edition: Edition) -> dict[str, int]:
    """Insert today's edition and its articles (URL-unique: a story already
    published on an earlier day is skipped, never duplicated).

    A second run on the same day (e.g. a manual run after the cron) only ADDS
    stories: the morning's headline and front page stay, and the re-run's
    front-page picks are filed under research instead of stacking a second front page.
    """
    with conn.transaction(), conn.cursor() as cur:
        existing = cur.execute(
            """SELECT e.id, EXISTS (SELECT 1 FROM articles a WHERE a.edition_id = e.id AND a.category = 'front_page')
               FROM editions e WHERE e.edition_date = %s""",
            (edition.edition_date,),
        ).fetchone()
        cur.execute(
            """INSERT INTO editions (edition_date, summary_headline, item_counts)
               VALUES (%s, %s, %s::jsonb)
               ON CONFLICT (edition_date) DO UPDATE
                 SET summary_headline = COALESCE(NULLIF(editions.summary_headline, ''), EXCLUDED.summary_headline),
                     item_counts = editions.item_counts || jsonb_build_object('last_rerun', EXCLUDED.item_counts)
               RETURNING id""",
            (edition.edition_date, edition.summary_headline, psycopg.types.json.Json(edition.stats)),
        )
        edition_id = cur.fetchone()[0]
        has_front_page = bool(existing and existing[1])
        inserted = 0
        placeholders = ", ".join(["%s"] * len(ARTICLE_COLUMNS))
        for a in edition.articles:
            category = "research" if (a.category == "front_page" and has_front_page) else a.category
            cur.execute(
                f"INSERT INTO articles ({', '.join(ARTICLE_COLUMNS)}) VALUES ({placeholders}) "
                "ON CONFLICT (url) DO NOTHING",
                (
                    edition_id, category, a.title, a.what_happened, a.why_it_matters, a.url, a.source[:100],
                    a.relevance_score, a.deadline, a.tags, a.related_urls, a.event_start, a.event_timezone,
                    a.is_remote, a.event_format, a.job_level, a.company, a.location, a.published_at,
                ),
            )
            inserted += cur.rowcount
        edition_no = cur.execute("SELECT COUNT(*) FROM editions WHERE edition_date <= %s", (edition.edition_date,)).fetchone()[0]
    result = {"edition_id": edition_id, "edition_number": edition_no, "inserted": inserted,
              "skipped_existing": len(edition.articles) - inserted, "rerun": existing is not None}
    log.info("saved edition %s (No. %d%s): %d articles inserted, %d already existed",
             edition.edition_date, edition_no, ", same-day re-run" if existing else "", inserted, result["skipped_existing"])
    return result


_ARTICLE_SELECT = """
    SELECT category, title, what_happened, coalesce(why_it_matters, ''), url, coalesce(source, ''),
           coalesce(relevance_score, 0), to_char(deadline, 'YYYY-MM-DD'), coalesce(tags, '{}'),
           coalesce(related_urls, '{}')
    FROM articles"""


def _row_to_article(r) -> Article:
    return Article(
        category=r[0], title=r[1], what_happened=r[2], why_it_matters=r[3], url=r[4], source=r[5],
        relevance_score=r[6], deadline=r[7], tags=list(r[8]), related_urls=list(r[9]),
    )


def edition_exists(conn: psycopg.Connection, edition_date: str) -> bool:
    """Whether an edition for `edition_date` is already saved."""
    return conn.execute("SELECT 1 FROM editions WHERE edition_date = %s::date", (edition_date,)).fetchone() is not None


def load_latest_edition(conn: psycopg.Connection, edition_date: str | None = None) -> tuple[Edition, int] | None:
    """The edition as stored (merged across same-day runs): latest, or for `edition_date`."""
    row = conn.execute(
        """SELECT id, to_char(edition_date, 'YYYY-MM-DD'), coalesce(summary_headline, ''),
                  (SELECT COUNT(*) FROM editions e2 WHERE e2.edition_date <= e.edition_date)
           FROM editions e WHERE %s::date IS NULL OR edition_date = %s::date
           ORDER BY edition_date DESC LIMIT 1""",
        (edition_date, edition_date),
    ).fetchone()
    if row is None:
        return None
    rows = conn.execute(_ARTICLE_SELECT + " WHERE edition_id = %s ORDER BY relevance_score DESC", (row[0],)).fetchall()
    return Edition(edition_date=row[1], summary_headline=row[2], articles=[_row_to_article(r) for r in rows]), row[3]


def deadlines_within(conn: psycopg.Connection, days: int) -> list[Article]:
    """Articles from ANY edition whose deadline is today..today+days (UTC), soonest first."""
    rows = conn.execute(
        _ARTICLE_SELECT + " WHERE deadline BETWEEN (NOW() AT TIME ZONE 'UTC')::date AND (NOW() AT TIME ZONE 'UTC')::date + %s"
        " ORDER BY deadline, relevance_score DESC",
        (days,),
    ).fetchall()
    return [_row_to_article(r) for r in rows]


def subscribers_due(conn: psycopg.Connection, edition_date: str, limit: int) -> list[tuple[int, str, str]]:
    """Active subscribers who haven't had this edition's briefing yet: (id, email, unsubscribe_token)."""
    return conn.execute(
        """SELECT id, email, unsubscribe_token FROM subscribers
           WHERE status = 'active' AND (last_sent_on IS NULL OR last_sent_on < %s::date)
           ORDER BY confirmed_at NULLS LAST, id LIMIT %s""",
        (edition_date, limit),
    ).fetchall()


def mark_briefed(conn: psycopg.Connection, ids: list[int], edition_date: str) -> None:
    if ids:
        conn.execute("UPDATE subscribers SET last_sent_on = %s::date WHERE id = ANY(%s)", (edition_date, ids))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
