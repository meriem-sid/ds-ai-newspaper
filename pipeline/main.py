"""Run the newspaper pipeline.

Usage:
    python -m pipeline.main                 # full run: ingest → clean → LLM → save to Postgres
    python -m pipeline.main --dry-run       # same, but write nothing (DB is only read)
    python -m pipeline.main --no-llm        # heuristic ranking, no LLM calls, never saved
    python -m pipeline.main --local --remember   # no database: JSON seen-cache in .cache/
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import textwrap
from datetime import datetime, timezone

from . import db, notify
from .clean import LocalSeenStore, clean, normalize_url
from .config import ROOT, settings
from .editor import EditorError, build_edition, build_edition_heuristic
from .ingest import ingest_all
from .models import Edition

log = logging.getLogger("main")

SECTION_TITLES = {
    "front_page": "FRONT PAGE",
    "research": "RESEARCH & DEEP DIVES",
    "hackathon": "HACKATHONS & COMPETITIONS",
    "job": "JOBS & INTERNSHIPS",
    "webinar": "WEBINARS & EVENTS",
}


def print_edition(ed: Edition) -> None:
    width = 88
    wrap = lambda s, indent="    ": textwrap.fill(s, width, initial_indent=indent, subsequent_indent=indent)  # noqa: E731
    print("\n" + "═" * width)
    print("THE DATA SCIENCE & AI NEWSPAPER".center(width))
    print(datetime.fromisoformat(ed.edition_date).strftime("%A, %d %B %Y").center(width))
    print("═" * width)
    print(textwrap.fill(ed.summary_headline.upper(), width).center(width))
    print("─" * width)

    for cat, label in SECTION_TITLES.items():
        arts = sorted((a for a in ed.articles if a.category == cat), key=lambda a: -a.relevance_score)
        if not arts:
            continue
        print(f"\n■ {label} ({len(arts)})\n")
        for a in arts:
            meta = [a.source, f"score {a.relevance_score}/10"]
            if a.deadline:
                meta.append(f"DEADLINE {a.deadline}")
            if a.event_start:
                meta.append(f"STARTS {a.event_start[:16].replace('T', ' ')} {a.event_timezone or ''}".strip())
            if a.job_level:
                meta.append(a.job_level)
            if a.is_remote:
                meta.append("remote")
            if a.event_format:
                meta.append(a.event_format)
            if a.related_urls:
                meta.append(f"+{len(a.related_urls)} related")
            print(f"  ▸ {a.title}")
            print(f"    [{' · '.join(meta)}]")
            print(wrap(a.what_happened))
            if a.why_it_matters:
                print(wrap("Why it matters: " + a.why_it_matters))
            if a.tags:
                print(f"    #{' #'.join(a.tags)}")
            print(f"    {a.url}\n")

    print("─" * width)
    print("Run stats: " + ", ".join(f"{k}={v}" for k, v in ed.stats.items()))
    print("═" * width)


def send_subscriber_briefings(edition: Edition, deadlines, edition_number: int) -> None:
    """Email active subscribers who haven't had this edition yet. Never fails the run."""
    if not notify.email_configured():
        log.info("email: RESEND_API_KEY / EMAIL_FROM / WEB_APP_URL not set; skipping subscriber briefing")
        return
    limit = int(os.getenv("EMAIL_DAILY_LIMIT", "95"))  # Resend free plan: 100 emails/day
    try:
        with db.connect() as conn:
            recipients = db.subscribers_due(conn, edition.edition_date, limit)
        sent = notify.send_briefings(recipients, edition, deadlines, edition_number)
        with db.connect() as conn:
            db.mark_briefed(conn, sent, edition.edition_date)
    except Exception as exc:  # noqa: BLE001 — the edition is already saved; email is best-effort
        log.error("email: briefing step failed: %s", exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build today's Data Science & AI Newspaper edition.")
    parser.add_argument("--no-llm", action="store_true", help="Skip the LLM; use a heuristic ranking (for testing ingest/clean).")
    parser.add_argument("--dry-run", action="store_true", help="Read the seen-history but write nothing (no DB save, no seen update).")
    parser.add_argument("--local", action="store_true", help="Ignore DATABASE_URL; use the local JSON seen-cache.")
    parser.add_argument("--remember", action="store_true", help="With --local: record processed items in the local seen-cache.")
    parser.add_argument("--no-notify", action="store_true", help="Save the edition but don't send the Telegram/email digest.")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252

    today = datetime.now(timezone.utc).date()
    use_db = bool(db.database_url()) and not args.local
    if use_db:
        # Short-lived connections only: the LLM stage can take minutes, and Neon
        # drops idle connections / suspends idle computes.
        with db.connect() as conn:
            db.apply_schema(conn)  # idempotent; keeps the DB in sync with db/schema.sql
            seen_urls, seen_titles = db.PgSeenStore(conn).load()
        log.info("Postgres seen-history: %d urls%s", len(seen_urls), " (dry run: read-only)" if args.dry_run else "")
    else:
        local_store = LocalSeenStore()
        seen_urls, seen_titles = local_store.load()

    raw = ingest_all()
    cleaned, clean_stats = clean(raw, seen_urls, seen_titles)
    if not cleaned:
        log.warning("Nothing new after cleaning - no edition today.")
        return 0

    try:
        edition = build_edition_heuristic(cleaned, today) if args.no_llm else build_edition(cleaned, today)
    except EditorError as exc:
        log.error("%s", exc)
        return 1
    edition.stats = {**clean_stats, **edition.stats, "published": len(edition.articles)}

    print_edition(edition)

    out = ROOT / ".cache" / f"edition-{edition.edition_date}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(edition.model_dump_json(indent=2), encoding="utf-8")
    log.info("saved %s", out.relative_to(ROOT))

    kept = {normalize_url(a.url) for a in edition.articles}
    if args.dry_run:
        return 0
    if use_db:
        if args.no_llm:
            log.warning("--no-llm edition is not saved to the database (heuristic copy is not publishable)")
            return 0
        with db.connect() as conn:
            saved = db.save_edition(conn, edition)
            db.PgSeenStore(conn).record(cleaned, kept)  # only after a successful save
            deadlines = db.deadlines_within(conn, notify.DEADLINE_DAYS)
            # Digest the edition as stored, so a same-day re-run reports the merged edition.
            stored = db.load_latest_edition(conn, edition.edition_date)
        if not args.no_notify:
            digest_edition = stored[0] if stored else edition
            sent = notify.notify(digest_edition, deadlines, saved["edition_number"])
            log.info("notifications: %s", ", ".join(f"{k}={'sent' if v else 'skipped'}" for k, v in sent.items()))
            send_subscriber_briefings(digest_edition, deadlines, saved["edition_number"])
    elif args.remember:
        local_store.record(cleaned, kept)
        log.info("recorded %d items in %s", len(cleaned), settings.seen_cache_path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
