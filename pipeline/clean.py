"""Stage 2 — Deduplication & pre-filtering (no LLM calls, cheap and deterministic).

1. Normalize URLs (strip tracking params, fragments, www, trailing slash).
2. Drop URLs / headlines already seen in the last 30 days.
3. Drop items outside the time window (news: hours, events/jobs: days).
4. Collapse exact-URL and near-duplicate headlines across aggregators with rapidfuzz.

The "seen" store is a local JSON file in Phase 1 and becomes the Postgres
`seen_items` table in Phase 2; both expose the same `load()` / `record()` API.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from rapidfuzz import fuzz

from .config import SOURCES, settings
from .models import RawItem

log = logging.getLogger("clean")

TITLE_DUP_THRESHOLD = 88   # within today's batch (token_set_ratio)
SEEN_TITLE_THRESHOLD = 92  # vs. headlines from previous days — stricter to avoid false drops
EXACTISH_THRESHOLD = 95    # jobs/events: only near-identical titles are the same item
SEEN_DAYS = 30

_TRACKING_PARAMS = re.compile(r"^(utm_\w+|ref|ref_src|source|fbclid|gclid|mc_cid|mc_eid|s|si|cmpid)$", re.I)

# Lower = preferred when collapsing duplicates (primary sources beat aggregators).
_SOURCE_PRIORITY = {"Hacker News": 9, "arXiv": 5, "HF Daily Papers": 4}


def normalize_url(url: str) -> str:
    parts = urlsplit(str(url).strip())
    host = parts.netloc.lower().removeprefix("www.")
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if not _TRACKING_PARAMS.match(k)])
    path = parts.path.rstrip("/") or "/"
    return urlunsplit(("https", host, path, query, ""))


def normalize_title(title: str) -> str:
    title = title.lower()
    title = re.sub(r"^(show|ask|tell) hn:\s*", "", title)
    title = re.sub(r"\[[^\]]*\]|\([^)]*pdf[^)]*\)", " ", title)
    title = re.sub(r"[^a-z0-9 ]+", " ", title)
    return re.sub(r"\s+", " ", title).strip()


# ── Seen store (Phase 1: JSON file) ─────────────────────────────────────────


class LocalSeenStore:
    def __init__(self, path: Path = settings.seen_cache_path):
        self.path = path

    def _read(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def load(self, days: int = SEEN_DAYS) -> tuple[set[str], list[str]]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        rows = {u: r for u, r in self._read().items() if r["seen_at"] >= cutoff}
        return set(rows), [r["title_norm"] for r in rows.values()]

    def record(self, items: list[RawItem], kept_urls: set[str]) -> None:
        data = self._read()
        now = datetime.now(timezone.utc)
        cutoff = (now - timedelta(days=SEEN_DAYS)).isoformat()
        data = {u: r for u, r in data.items() if r["seen_at"] >= cutoff}
        for it in items:
            for url in [str(it.url), *it.related_urls]:
                data[normalize_url(url)] = {
                    "title_norm": normalize_title(it.title),
                    "bucket": it.bucket,
                    "kept": normalize_url(str(it.url)) in kept_urls,
                    "seen_at": now.isoformat(),
                }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=1), encoding="utf-8")


# ── Filters ─────────────────────────────────────────────────────────────────


def _max_age(item: RawItem) -> timedelta:
    if item.max_age_hours:
        return timedelta(hours=item.max_age_hours)
    windows = SOURCES.get("time_windows", {})
    if item.bucket == "A":
        return timedelta(hours=windows.get("news_hours", 24))
    return timedelta(days=windows.get("events_days", 7))


def same_title(a_norm: str, b_norm: str, bucket: str) -> bool:
    """News (bucket A): token-set matching catches reworded coverage of one story.
    Jobs/events: token-set would merge "Senior Data Engineer at X" with "... at Y",
    so only near-identical titles count as the same item."""
    if bucket == "A":
        return fuzz.token_set_ratio(a_norm, b_norm) >= TITLE_DUP_THRESHOLD
    return fuzz.ratio(a_norm, b_norm) >= EXACTISH_THRESHOLD


def in_window(item: RawItem, now: datetime) -> bool:
    if item.published_at is None:
        # Undated news can't be proven fresh → drop. Events/jobs often lack a
        # publish date; the seen-store stops them from repeating.
        return item.bucket != "A"
    age = now - item.published_at
    return timedelta(hours=-6) <= age <= _max_age(item)  # small negative slack for clock skew


def _priority(item: RawItem) -> tuple[int, int]:
    return (_SOURCE_PRIORITY.get(item.source, 0), -item.signal)


def collapse_duplicates(items: list[RawItem]) -> list[RawItem]:
    """Greedy clustering: best-priority item absorbs exact-URL and near-duplicate headlines."""
    ordered = sorted(items, key=_priority)
    kept: list[RawItem] = []
    kept_norm: list[str] = []
    by_url: dict[str, RawItem] = {}

    for item in ordered:
        url = normalize_url(str(item.url))
        if url in by_url:
            by_url[url].signal = max(by_url[url].signal, item.signal)
            continue
        norm = normalize_title(item.title)
        match = None
        for idx, other_norm in enumerate(kept_norm):
            if kept[idx].bucket == item.bucket and same_title(norm, other_norm, item.bucket) and min(len(norm), len(other_norm)) > 15:
                match = kept[idx]
                break
        if match:
            match.related_urls.append(str(item.url))
            match.signal = max(match.signal, item.signal)
            by_url[url] = match
            continue
        kept.append(item)
        kept_norm.append(norm)
        by_url[url] = item
    return kept


def clean(items: list[RawItem], seen_urls: set[str], seen_titles: list[str], now: datetime | None = None) -> tuple[list[RawItem], dict[str, int]]:
    now = now or datetime.now(timezone.utc)
    stats = {"raw": len(items)}

    fresh = [i for i in items if normalize_url(str(i.url)) not in seen_urls]
    stats["after_seen_url"] = len(fresh)

    fresh = [i for i in fresh if in_window(i, now)]
    stats["after_window"] = len(fresh)

    fresh = collapse_duplicates(fresh)
    stats["after_collapse"] = len(fresh)

    if seen_titles:
        # Headline matching across days is for news only. Jobs and events are de-duplicated by
        # URL: two postings titled "Senior Data Engineer" at different companies are different items.
        fresh = [
            i for i in fresh
            if i.bucket != "A"
            or not any(fuzz.token_set_ratio(normalize_title(i.title), t) >= SEEN_TITLE_THRESHOLD for t in seen_titles)
        ]
    stats["after_seen_title"] = len(fresh)

    log.info("%s", " -> ".join(f"{k}={v}" for k, v in stats.items()))
    return fresh, stats
