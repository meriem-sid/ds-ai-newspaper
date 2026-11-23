"""Stage 4c — "Try today": three personal project ideas built on today's edition.

Sent to the owner's Telegram only (never the website or subscriber email), as a
second message after the digest. Tailored by a private reader profile:
  * READER_PROFILE env var (GitHub secret), or
  * reader_profile.md in the repo root (gitignored).
No profile → no ideas; nothing else changes.

Anti-hallucination contract (same as the editor):
  * The LLM references today's stories by integer id; links are copied from the
    saved edition. Ideas with no valid id are dropped.
  * It is told not to invent tools, datasets or URLs.
Failures are logged, never raised: the edition and digest are already out.

Manual test (uses the latest saved edition):
    python -m pipeline.ideas --preview   # print the ideas, send nothing
    python -m pipeline.ideas --send      # send them to Telegram
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

from pydantic import BaseModel, Field

from .config import ROOT
from .models import Article, Edition

log = logging.getLogger("ideas")

PROFILE_FILE = ROOT / "reader_profile.md"
LEVELS = ("quick", "weekend", "stretch")
LEVEL_LABELS = {"quick": "⚡ Quick try", "weekend": "🛠 Weekend build", "stretch": "🧗 Stretch"}

SYSTEM = """You suggest hands-on project ideas to one specific reader, based ONLY on today's
issue of a Data Science & AI newspaper. You get the reader's profile and today's stories (numbered).

Write exactly 3 ideas, one per level:
  - "quick":   doable in about 1-2 hours; try or poke at something new from today.
  - "weekend": a small, finishable project for a weekend (about 6-12 hours).
  - "stretch": a bit beyond the reader's comfort zone, but still finishable in about a week of evenings.

Rules:
  - Each idea must build on at least one of today's stories; list their numbers in source_ids.
  - Each idea must also use at least one method the reader already knows or is studying (from the
    profile), so it connects today's news to what they are learning.
  - Combine things only when the combination makes technical sense. One story + the reader's own
    topics is better than a forced mash-up of unrelated stories. Never pair a paper with a task it
    doesn't apply to.
  - Fit the reader's level: beginner-to-intermediate. They should be able to finish it and
    understand how the pieces fit together. It must run on a laptop or free Google Colab: no
    training or fine-tuning of large language models, no models bigger than ~8B parameters,
    no multi-agent systems. Reproducing a paper's core idea at toy scale (small data, small model)
    is a great stretch idea. No vague "build a startup"-sized ideas.
  - Be creative and specific: an interesting angle, a fun question to answer, a small thing to make.
  - Only name tools, models and datasets that appear in today's stories, plus the libraries the
    reader already knows. Never invent tool names, dataset names, URLs, install commands or numbers.
    If data is needed and none is in the stories, describe the KIND of small public dataset to look
    for (e.g. "a labelled dataset of bot and human accounts from Kaggle"), never a specific name.
  - Never mention story numbers in the text; refer to stories by what they are about (e.g. "today's
    MemOnce paper"). The numbers go only in source_ids.
  - first_step must be concrete and doable in the first 20 minutes, without guessing setup details
    (say "follow the model card's quick-start", not a made-up command).
  - Plain language, no hype, no emojis."""


class Idea(BaseModel):
    level: str = Field(description="One of: quick, weekend, stretch.")
    title: str = Field(description="Short, specific project title, max ~70 chars.")
    pitch: str = Field(description="1-2 sentences: what you build and the interesting angle or question.")
    connects: str = Field(description="One short phrase: which of today's stories and which of the reader's topics it ties together.")
    first_step: str = Field(description="One concrete action for the first 20 minutes.")
    time_estimate: str = Field(description="Rough effort, e.g. '~1.5 hours', 'a weekend', '4-5 evenings'.")
    source_ids: list[int] = Field(description="Numbers of today's stories this idea builds on. At least one.")


class IdeasResponse(BaseModel):
    ideas: list[Idea]


class ProjectIdea(BaseModel):
    """A verified idea, with links resolved from the edition (never from the LLM)."""
    level: str
    title: str
    pitch: str
    connects: str
    first_step: str
    time_estimate: str
    sources: list[tuple[str, str]]  # (title, url)


def load_profile() -> str | None:
    text = os.getenv("READER_PROFILE") or (PROFILE_FILE.read_text(encoding="utf-8") if PROFILE_FILE.exists() else "")
    return text.strip() or None


def _prompt(profile: str, articles: list[Article]) -> str:
    lines = ["READER PROFILE:", profile, "", "TODAY'S STORIES:"]
    for i, a in enumerate(articles, 1):
        tags = f" [{', '.join(a.tags[:4])}]" if a.tags else ""
        lines.append(f"{i}. ({a.category}) {a.title}{tags}\n   {a.what_happened} {a.why_it_matters}".rstrip())
    return "\n".join(lines)


def verify_ideas(raw: list[Idea], articles: list[Article]) -> list[ProjectIdea]:
    """Keep at most one idea per level, in quick → weekend → stretch order; drop ungrounded ones."""
    by_level: dict[str, ProjectIdea] = {}
    for idea in raw:
        level = idea.level.strip().lower()
        if level not in LEVELS or level in by_level:
            continue
        ids = [i for i in dict.fromkeys(idea.source_ids) if 1 <= i <= len(articles)]
        if not ids or not idea.title.strip() or not idea.first_step.strip():
            log.info("ideas: dropped ungrounded/empty idea %r", idea.title[:60])
            continue
        by_level[level] = ProjectIdea(
            level=level,
            title=idea.title.strip(),
            pitch=idea.pitch.strip(),
            connects=idea.connects.strip(),
            first_step=idea.first_step.strip(),
            time_estimate=idea.time_estimate.strip(),
            sources=[(articles[i - 1].title, articles[i - 1].url) for i in ids[:3]],
        )
    return [by_level[lv] for lv in LEVELS if lv in by_level]


def generate_ideas(edition: Edition, profile: str | None = None) -> list[ProjectIdea]:
    profile = profile if profile is not None else load_profile()
    if not profile:
        log.info("ideas: no READER_PROFILE / reader_profile.md; skipping")
        return []
    articles = sorted(edition.articles, key=lambda a: -a.relevance_score)[:25]
    if not articles:
        return []
    from .editor import EditorError, _call_structured, _gemini_client

    try:
        result = _call_structured(_gemini_client(), _prompt(profile, articles), IdeasResponse, system=SYSTEM, retries=2)
    except EditorError as exc:
        log.warning("ideas: LLM failed (%s); no ideas today", exc)
        return []
    ideas = verify_ideas(result.ideas, articles)
    log.info("ideas: %d of %d kept", len(ideas), len(result.ideas))
    return ideas


def build_ideas_message(ideas: list[ProjectIdea], edition_date: str) -> str:
    from datetime import date

    from .notify import TELEGRAM_LIMIT, _e, _link

    d = date.fromisoformat(edition_date)
    lines = [f"<b>Try today — {d.strftime('%a %d %b')}</b>", "<i>Three things to build from today's paper</i>"]
    for idea in ideas:
        lines += ["", f"<b>{LEVEL_LABELS[idea.level]} · {_e(idea.time_estimate)}</b>", f"<b>{_e(idea.title)}</b>", _e(idea.pitch)]
        if idea.connects:
            lines.append(f"<i>Connects:</i> {_e(idea.connects)}")
        lines.append(f"<i>First step:</i> {_e(idea.first_step)}")
        lines.append("<i>From:</i> " + " · ".join(_link(url, title if len(title) <= 60 else title[:59] + "…") for title, url in idea.sources))
    text = "\n".join(lines)
    return text if len(text) <= TELEGRAM_LIMIT else text[: TELEGRAM_LIMIT - 20].rsplit("\n", 1)[0] + "\n…"


def send_ideas(edition: Edition) -> bool:
    """Generate and send today's ideas. Best-effort: never raises."""
    from .notify import send_telegram

    try:
        ideas = generate_ideas(edition)
        return bool(ideas) and send_telegram(build_ideas_message(ideas, edition.edition_date))
    except Exception as exc:  # noqa: BLE001 — ideas are a bonus; never fail the run
        log.error("ideas: failed: %s", exc)
        return False


def main() -> int:
    from . import config  # noqa: F401  (loads .env + logging)
    from . import db

    parser = argparse.ArgumentParser(description="Project ideas from the latest saved edition.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--preview", action="store_true", help="Print the ideas; send nothing.")
    group.add_argument("--send", action="store_true", help="Send the ideas to Telegram.")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    with db.connect() as conn:
        latest = db.load_latest_edition(conn)
    if latest is None:
        log.error("no saved edition yet")
        return 1
    edition = latest[0]
    if args.send:
        return 0 if send_ideas(edition) else 1
    ideas = generate_ideas(edition)
    print(build_ideas_message(ideas, edition.edition_date) if ideas else "(no ideas)")
    return 0 if ideas else 1


if __name__ == "__main__":
    sys.exit(main())
