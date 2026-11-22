"""Stage 4b — Morning ping: top Front Page headlines, deadlines closing within 5 days,
and a link to the web app. Telegram, plus the subscriber email briefing (Azure Communication Services Email).

Notification failures are logged, never raised: a dead bot token must not fail a
run whose edition is already saved.

Manual test (uses the latest saved edition):
    python -m pipeline.notify --test         # Telegram digest
    python -m pipeline.notify --preview      # print the Telegram digest, send nothing
    python -m pipeline.notify --briefing     # email confirmed subscribers who haven't had it yet
"""
from __future__ import annotations

import argparse
import html
import logging
import os
import sys
import time
import uuid
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


# ── Email briefing to subscribers (Azure Communication Services Email) ─────

UNSUB_PLACEHOLDER = "%%UNSUBSCRIBE_URL%%"

SECTION_LINKS = [  # (category, (singular, plural), anchor on the edition page)
    ("research", ("research story", "research stories"), "research"),
    ("resource", ("tool or resource", "tools & resources"), "resources"),
    ("hackathon", ("hackathon", "hackathons"), "hackathons"),
    ("job", ("job", "jobs"), "jobs"),
    ("webinar", ("event", "events"), "webinars"),
]


def email_configured() -> bool:
    return bool(os.getenv("AZURE_COMMUNICATION_CONNECTION_STRING") and os.getenv("AZURE_EMAIL_SENDER") and os.getenv("WEB_APP_URL"))


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


def _azure_client():
    from azure.communication.email import EmailClient  # imported lazily: only needed when email is on

    return EmailClient.from_connection_string(os.environ["AZURE_COMMUNICATION_CONNECTION_STRING"])


def briefing_operation_id(edition_date: str, subscriber_id: int) -> str:
    """Stable GUID per (edition, subscriber): Azure treats a repeated send with the same
    operation id as the same request, so a retried run can't send a duplicate."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ds-ai-daily:briefing:{edition_date}:{subscriber_id}"))


def send_briefings(recipients: list[tuple[int, str, str]], edition: Edition, deadlines: list[Article],
                   edition_number: int | None = None) -> list[int]:
    """Send the briefing via Azure Communication Services Email; returns ids that were sent.

    One message per subscriber (each has its own unsubscribe link plus List-Unsubscribe /
    List-Unsubscribe-Post headers for one-click unsubscribe), paced to stay under Azure's
    per-minute limit: 30/min on a custom domain, 5/min on the Azure-managed test domain."""
    if not recipients:
        return []
    web = os.environ["WEB_APP_URL"].rstrip("/")
    sender = os.environ["AZURE_EMAIL_SENDER"]
    interval = float(os.getenv("EMAIL_SEND_INTERVAL_SECONDS", "2.5"))
    subject, html_body, text_body = build_briefing(edition, deadlines, web, edition_number)
    client = _azure_client()
    sent: list[int] = []
    for n, (sid, email, token) in enumerate(recipients):
        if n:
            time.sleep(interval)
        page = f"{web}/unsubscribe?token={token}"
        one_click = f"{web}/api/unsubscribe?token={token}"
        message = {
            "senderAddress": sender,
            "recipients": {"to": [{"address": email}]},
            "content": {
                "subject": subject,
                "html": html_body.replace(UNSUB_PLACEHOLDER, html.escape(page, quote=True)),
                "plainText": text_body.replace(UNSUB_PLACEHOLDER, page),
            },
            "headers": {"List-Unsubscribe": f"<{one_click}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
            "userEngagementTrackingDisabled": True,  # no open/click tracking
        }
        try:
            poller = client.begin_send(message, operation_id=briefing_operation_id(edition.edition_date, sid))
            status = (poller.result(timeout=120) or {}).get("status")
        except Exception as exc:  # noqa: BLE001 — one bad address or a throttle must not stop the rest
            log.error("email: send to subscriber %s failed: %s", sid, str(exc)[:200])
            continue
        if status == "Succeeded":  # "accepted for delivery" in Azure's terms
            sent.append(sid)
        else:
            log.error("email: send to subscriber %s ended with status %s", sid, status)
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
    group.add_argument("--briefing", action="store_true",
                       help="Email the latest edition's briefing to confirmed subscribers who haven't had it yet.")
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
    if args.briefing:
        if not email_configured():
            log.error("set AZURE_COMMUNICATION_CONNECTION_STRING, AZURE_EMAIL_SENDER and WEB_APP_URL in .env first")
            return 1
        limit = int(os.getenv("EMAIL_DAILY_LIMIT", "95"))
        with db.connect() as conn:
            recipients = db.subscribers_due(conn, edition.edition_date, limit)
        if not recipients:
            log.warning("no confirmed subscribers are due a briefing for %s", edition.edition_date)
            return 1
        sent = send_briefings(recipients, edition, deadlines, number)
        with db.connect() as conn:
            db.mark_briefed(conn, sent, edition.edition_date)
        return 0 if sent else 1
    result = notify(edition, deadlines, number)
    return 0 if any(result.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
