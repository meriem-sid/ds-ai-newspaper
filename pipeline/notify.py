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

    counts = {c: sum(a.category == c for a in edition.articles) for c in ("research", "resource", "hackathon", "job", "webinar")}
    labels = {"research": ("research", "research"), "resource": ("tool", "tools"), "hackathon": ("hackathon", "hackathons"),
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


def notify(edition: Edition, deadlines: list[Article], edition_number: int | None = None) -> dict[str, bool]:
    """Telegram digest (to the owner). Subscriber emails go through send_briefings()."""
    text = build_digest(edition, deadlines, os.getenv("WEB_APP_URL"), edition_number)
    return {"telegram": send_telegram(text)}


# ── Email briefing to subscribers (Resend) ──────────────────────────────────

RESEND_BATCH = 100  # Resend: max emails per batch call
UNSUB_PLACEHOLDER = "%%UNSUBSCRIBE_URL%%"

SECTION_LINKS = [  # (category, (singular, plural), anchor on the edition page)
    ("research", ("research story", "research stories"), "research"),
    ("resource", ("tool or resource", "tools & resources"), "resources"),
    ("hackathon", ("hackathon", "hackathons"), "hackathons"),
    ("job", ("job", "jobs"), "jobs"),
    ("webinar", ("event", "events"), "webinars"),
]


def email_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY") and os.getenv("EMAIL_FROM") and os.getenv("WEB_APP_URL"))


def _first_sentence(text: str) -> str:
    parts = (text or "").strip().split(". ")
    return parts[0].rstrip(".") + "." if parts and parts[0] else ""


def build_briefing(edition: Edition, deadlines: list[Article], web_url: str, edition_number: int | None = None) -> tuple[str, str, str]:
    """(subject, html, text). Both bodies contain UNSUB_PLACEHOLDER, replaced per recipient.
    Scannable on purpose: headlines + one line each + links back to the site, not the whole paper."""
    web = web_url.rstrip("/")
    d = date.fromisoformat(edition.edition_date)
    today = datetime.now(timezone.utc).date()
    edition_url = f"{web}/edition/{edition.edition_date}"
    pretty = d.strftime("%A %d %B %Y")
    subject = f"DS & AI Daily · {d.strftime('%a %d %b')}: {edition.summary_headline or 'today’s briefing'}"[:140]

    tops = sorted((a for a in edition.articles if a.category == "front_page"), key=lambda a: -a.relevance_score)[:5]
    if not tops:  # a quiet news day: lead with the best of everything else
        tops = sorted((a for a in edition.articles if a.category in ("research", "resource")), key=lambda a: -a.relevance_score)[:3]
    counts = [(labels, anchor, sum(a.category == cat for a in edition.articles)) for cat, labels, anchor in SECTION_LINKS]
    counts = [(labels[n != 1], anchor, n) for labels, anchor, n in counts if n]

    # ---------- plain text ----------
    t = [f"DS & AI DAILY — {pretty}" + (f" · No. {edition_number}" if edition_number else "")]
    if edition.summary_headline:
        t += ["", edition.summary_headline]
    if tops:
        t += ["", "TOP STORIES"]
        for a in tops:
            t += [f"- {a.title}", f"  {_first_sentence(a.what_happened)}", f"  {a.url}"]
    if deadlines:
        t += ["", f"CLOSING WITHIN {DEADLINE_DAYS} DAYS"]
        for a in deadlines[:8]:
            t.append(f"- {a.title} — {date.fromisoformat(a.deadline).strftime('%d %b')}: {a.url}")
    if counts:
        t += ["", "ALSO IN THIS EDITION: " + " · ".join(f"{n} {label}" for label, _, n in counts)]
    t += ["", f"Read the full edition: {edition_url}", f"Today's puzzles (Sudoku, Binary Grid): {web}/games",
          "", f"Unsubscribe: {UNSUB_PLACEHOLDER}"]
    text = "\n".join(t)

    # ---------- HTML (inline styles, tables: what email clients render reliably) ----------
    e, link = _e, lambda url, label, style="color:#1f3f6e": f'<a href="{html.escape(url, quote=True)}" style="{style}">{_e(label)}</a>'
    story_rows = "".join(
        f'<tr><td style="padding:14px 0;border-top:1px solid #e3e3df">'
        f'<div style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#8a8a86">{e(a.source)}</div>'
        f'<div style="margin-top:4px;font:700 18px/1.3 Georgia,serif">{link(a.url, a.title, "color:#1d1d1d;text-decoration:none")}</div>'
        f'<div style="margin-top:6px;font:15px/1.55 Georgia,serif;color:#333">{e(_first_sentence(a.what_happened))}</div>'
        f"</td></tr>"
        for a in tops
    )
    deadline_rows = "".join(
        f'<tr><td style="padding:6px 0;font:14px/1.5 Arial,sans-serif;color:#333">'
        f'<strong style="color:#8e2a20">{e(_left(a.deadline, today))}</strong> · {link(a.url, a.title, "color:#1d1d1d")}</td></tr>'
        for a in deadlines[:8]
    )
    sections = " · ".join(link(f"{edition_url}#{anchor}", f"{n} {label}") for label, anchor, n in counts)
    body = f"""<!doctype html><html><body style="margin:0;background:#f6f6f4;color:#1d1d1d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fcfcfb;border:1px solid #dcdcd8;border-radius:8px">
<tr><td style="padding:24px 28px 8px;border-bottom:3px solid #1d1d1d">
<div style="font:600 12px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6a6a6a">{e(pretty)}{f" · No. {edition_number}" if edition_number else ""}</div>
<div style="margin:6px 0 4px;font:700 26px/1.2 Georgia,serif">The Data Science &amp; AI Newspaper</div>
{f'<div style="margin-bottom:10px;font:italic 16px/1.4 Georgia,serif;color:#333">{e(edition.summary_headline)}</div>' if edition.summary_headline else ""}
</td></tr>
<tr><td style="padding:8px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 0 2px;font:700 13px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase">Top stories</td></tr>{story_rows}</table></td></tr>
{f'<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1e6e3;border-radius:6px"><tr><td style="padding:12px 16px"><div style="font:700 13px Arial,sans-serif;color:#8e2a20;letter-spacing:.08em;text-transform:uppercase">Closing within {DEADLINE_DAYS} days</div><table role="presentation" width="100%">{deadline_rows}</table></td></tr></table></td></tr>' if deadlines else ""}
{f'<tr><td style="padding:18px 28px 0;font:14px/1.6 Arial,sans-serif;color:#333">Also in this edition: {sections}</td></tr>' if counts else ""}
<tr><td style="padding:22px 28px 6px"><a href="{html.escape(edition_url, quote=True)}" style="display:inline-block;background:#1d1d1d;color:#f6f6f4;text-decoration:none;font:600 15px Arial,sans-serif;padding:12px 20px;border-radius:6px">Read the full edition →</a></td></tr>
<tr><td style="padding:10px 28px 24px;font:14px/1.6 Arial,sans-serif;color:#333">🧩 Today's puzzles: {link(f"{web}/games/sudoku", "Sudoku")} · {link(f"{web}/games/binary", "Binary Grid")}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e3e3df;font:12px/1.6 Arial,sans-serif;color:#8a8a86">You're getting this because you subscribed at {link(web, web.split("//")[-1], "color:#8a8a86")}.
<a href="{UNSUB_PLACEHOLDER}" style="color:#8a8a86">Unsubscribe</a> anytime, in one click.</td></tr>
</table></td></tr></table></body></html>"""
    return subject, body, text


def _left(deadline: str, today: date) -> str:
    n = (date.fromisoformat(deadline) - today).days
    return "today" if n <= 0 else "tomorrow" if n == 1 else f"in {n} days"


def send_briefings(recipients: list[tuple[int, str, str]], edition: Edition, deadlines: list[Article],
                   edition_number: int | None = None) -> list[int]:
    """Send the briefing via Resend's batch API; returns ids that were sent.
    Each email has its own unsubscribe link plus List-Unsubscribe / List-Unsubscribe-Post
    headers (one-click unsubscribe in Gmail, Outlook, Apple Mail)."""
    if not recipients:
        return []
    web = os.environ["WEB_APP_URL"].rstrip("/")
    subject, html_body, text_body = build_briefing(edition, deadlines, web, edition_number)
    sent: list[int] = []
    for start in range(0, len(recipients), RESEND_BATCH):
        chunk = recipients[start : start + RESEND_BATCH]
        payload = []
        for _, email, token in chunk:
            page = f"{web}/unsubscribe?token={token}"
            one_click = f"{web}/api/unsubscribe?token={token}"
            payload.append({
                "from": os.environ["EMAIL_FROM"],
                "to": [email],
                "subject": subject,
                "html": html_body.replace(UNSUB_PLACEHOLDER, html.escape(page, quote=True)),
                "text": text_body.replace(UNSUB_PLACEHOLDER, page),
                "headers": {"List-Unsubscribe": f"<{one_click}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
            })
        # Same key for the same edition + recipients: a retried request can't double-send (Resend keeps keys 24h).
        key = f"briefing-{edition.edition_date}-{chunk[0][0]}-{chunk[-1][0]}-{len(chunk)}"
        try:
            resp = httpx.post(
                "https://api.resend.com/emails/batch",
                headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}", "Idempotency-Key": key},
                json=payload,
                timeout=60,
            )
        except httpx.HTTPError as exc:
            log.error("email: batch of %d failed: %s", len(chunk), type(exc).__name__)
            continue
        if resp.status_code >= 300:
            log.error("email: batch of %d failed (HTTP %s): %s", len(chunk), resp.status_code, resp.text[:200])
            continue
        sent += [sid for sid, _, _ in chunk]
    log.info("email: briefing sent to %d of %d subscribers", len(sent), len(recipients))
    return sent


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
