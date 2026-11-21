"""Stage 4b — Morning ping: top Front Page headlines, deadlines closing within 5 days,
and a link to the web app. Telegram (primary) and/or email via Resend (optional).

Notification failures are logged, never raised: a dead bot token must not fail a
run whose edition is already saved.

Manual test (sends the latest saved edition's digest):
    python -m pipeline.notify --test
    python -m pipeline.notify --preview      # print only, send nothing
"""
from __future__ import annotations

import argparse
import html
import logging
import os
import sys
from datetime import date, datetime, timezone

import httpx

from .models import Article, Edition

log = logging.getLogger("notify")

DEADLINE_DAYS = 5
TELEGRAM_LIMIT = 4096


def _e(text: str) -> str:
    return html.escape(text or "", quote=False)


def _link(url: str, text: str) -> str:
    return f'<a href="{html.escape(url, quote=True)}">{_e(text)}</a>'


def _clip(text: str, n: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


def build_digest(edition: Edition, deadlines: list[Article], web_url: str | None, edition_number: int | None = None) -> str:
    """Telegram-flavoured HTML (also used as the email body)."""
    d = date.fromisoformat(edition.edition_date)
    today = datetime.now(timezone.utc).date()
    lines = [f"<b>DS &amp; AI Daily — {d.strftime('%a %d %b %Y')}</b>" + (f" · No. {edition_number}" if edition_number else "")]
    if edition.summary_headline:
        lines.append(f"<i>{_e(edition.summary_headline)}</i>")

    front = sorted((a for a in edition.articles if a.category == "front_page"), key=lambda a: -a.relevance_score)[:3]
    if front:
        lines += ["", "<b>Front page</b>"]
        for i, a in enumerate(front, 1):
            lines.append(f"{i}. {_link(a.url, a.title)}")
            if a.why_it_matters:
                lines.append(f"   <i>{_e(_clip(a.why_it_matters, 160))}</i>")

    if deadlines:
        lines += ["", f"<b>Closing within {DEADLINE_DAYS} days</b>"]
        for a in deadlines[:8]:
            left = (date.fromisoformat(a.deadline) - today).days
            when = "today" if left == 0 else "tomorrow" if left == 1 else f"in {left} days"
            lines.append(f"• {_link(a.url, a.title)} — <b>{when}</b> ({date.fromisoformat(a.deadline).strftime('%d %b')})")

    counts = {c: sum(a.category == c for a in edition.articles) for c in ("research", "hackathon", "job", "webinar")}
    labels = {"research": ("research", "research"), "hackathon": ("hackathon", "hackathons"),
              "job": ("job", "jobs"), "webinar": ("event", "events")}
    also = " · ".join(f"{n} {labels[c][n != 1]}" for c, n in counts.items() if n)
    if also:
        lines += ["", f"Also today: {also}"]
    if web_url:
        lines += ["", _link(web_url, "Read the full edition →")]

    text = "\n".join(lines)
    return text if len(text) <= TELEGRAM_LIMIT else text[: TELEGRAM_LIMIT - 20].rsplit("\n", 1)[0] + "\n…"


def send_telegram(text: str) -> bool:
    token, chat_id = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        log.info("telegram: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set; skipping")
        return False
    try:
        resp = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "link_preview_options": {"is_disabled": True}},
            timeout=20,
        )
        if resp.status_code != 200 or not resp.json().get("ok"):
            # Never log the URL: it contains the bot token.
            log.error("telegram: send failed (HTTP %s): %s", resp.status_code, resp.text[:200])
            return False
        log.info("telegram: digest sent")
        return True
    except httpx.HTTPError as exc:
        log.error("telegram: send failed: %s", type(exc).__name__)
        return False


def send_email(subject: str, html_body: str) -> bool:
    key, to = os.getenv("RESEND_API_KEY"), os.getenv("NOTIFY_EMAIL_TO")
    if not key or not to:
        return False
    sender = os.getenv("NOTIFY_EMAIL_FROM", "DS & AI Daily <onboarding@resend.dev>")
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}"},
            json={"from": sender, "to": [to], "subject": subject, "html": html_body.replace("\n", "<br>")},
            timeout=20,
        )
        if resp.status_code >= 300:
            log.error("email: send failed (HTTP %s): %s", resp.status_code, resp.text[:200])
            return False
        log.info("email: digest sent")
        return True
    except httpx.HTTPError as exc:
        log.error("email: send failed: %s", type(exc).__name__)
        return False


def notify(edition: Edition, deadlines: list[Article], edition_number: int | None = None) -> dict[str, bool]:
    text = build_digest(edition, deadlines, os.getenv("WEB_APP_URL"), edition_number)
    subject = f"DS & AI Daily — {edition.summary_headline or edition.edition_date}"
    return {"telegram": send_telegram(text), "email": send_email(subject, text)}


# ── Manual test entry point ─────────────────────────────────────────────────


def main() -> int:
    from . import config  # noqa: F401  (loads .env + logging)
    from . import db

    parser = argparse.ArgumentParser(description="Send (or preview) the digest for the latest saved edition.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--test", action="store_true", help="Send the latest edition's digest now.")
    group.add_argument("--preview", action="store_true", help="Print the digest; send nothing.")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    with db.connect() as conn:
        latest = db.load_latest_edition(conn)
        if latest is None:
            log.error("no saved edition yet")
            return 1
        edition, number = latest
        deadlines = db.deadlines_within(conn, DEADLINE_DAYS)

    if args.preview:
        print(build_digest(edition, deadlines, os.getenv("WEB_APP_URL"), number))
        return 0
    result = notify(edition, deadlines, number)
    return 0 if any(result.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
