"""Stage 1 — Multi-source ingestion.

Every fetcher returns list[RawItem] and never raises: a broken source is logged
and skipped so one dead feed can't kill the daily edition.

Phase 1: Bucket A (RSS, arXiv, Hugging Face Daily Papers, Hacker News).
Phase 2 adds Bucket B (Kaggle, Tavily hackathons) and Bucket C (jobs, webinars).
"""
from __future__ import annotations

import calendar
import html
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import feedparser
import httpx
from pydantic import ValidationError

from .config import SOURCES, settings
from .models import RawItem

log = logging.getLogger("ingest")

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def clean_text(text: str | None, limit: int = 700) -> str:
    """Strip HTML tags/entities and collapse whitespace."""
    if not text:
        return ""
    text = html.unescape(_TAG_RE.sub(" ", text))
    text = _WS_RE.sub(" ", text).strip()
    return text[:limit].rsplit(" ", 1)[0] + "…" if len(text) > limit else text


def _client() -> httpx.Client:
    return httpx.Client(
        timeout=settings.http_timeout,
        follow_redirects=True,
        headers={"User-Agent": settings.user_agent},
    )


def _make(items: list[RawItem], **kwargs) -> None:
    """Build a RawItem, silently dropping anything with an invalid URL/title."""
    try:
        if not kwargs.get("title"):
            return
        items.append(RawItem(**kwargs))
    except ValidationError:
        log.debug("dropped invalid item: %s", kwargs.get("url"))


def _entry_date(entry) -> datetime | None:
    """feedparser gives UTC struct_time; calendar.timegm is the correct inverse."""
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        st = entry.get(key)
        if st:
            return datetime.fromtimestamp(calendar.timegm(st), tz=timezone.utc)
    return None


# ── RSS / Atom ──────────────────────────────────────────────────────────────


def _fetch_feed(client: httpx.Client, name: str, url: str) -> list[RawItem]:
    items: list[RawItem] = []
    try:
        try:
            resp = client.get(url)
        except (httpx.TimeoutException, httpx.ConnectError):
            log.info("rss  %-20s connect/timeout error; retrying once with a longer timeout", name)
            resp = client.get(url, timeout=settings.http_timeout * 3)
        resp.raise_for_status()
        parsed = feedparser.parse(resp.content)
        if parsed.bozo and not parsed.entries:
            raise ValueError(f"unparseable feed: {parsed.bozo_exception}")
        for e in parsed.entries[:50]:
            _make(
                items,
                title=clean_text(e.get("title"), 300),
                url=e.get("link", ""),
                source=name,
                published_at=_entry_date(e),
                raw_snippet=clean_text(e.get("summary") or e.get("description")),
                bucket="A",
            )
        log.info("rss  %-20s %3d items", name, len(items))
    except Exception as exc:  # noqa: BLE001 — never let one feed kill the run
        log.warning("rss  %-20s FAILED: %s", name, exc)
    return items


def fetch_rss(client: httpx.Client) -> list[RawItem]:
    feeds = SOURCES.get("rss") or []
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = pool.map(lambda f: _fetch_feed(client, f["name"], f["url"]), feeds)
    return [item for batch in results for item in batch]


# ── arXiv ───────────────────────────────────────────────────────────────────


def fetch_arxiv(client: httpx.Client) -> list[RawItem]:
    cfg = SOURCES.get("arxiv") or {}
    if not cfg.get("enabled"):
        return []
    items: list[RawItem] = []
    query = " OR ".join(f"cat:{c}" for c in cfg.get("categories", ["cs.AI"]))
    try:
        resp = client.get(
            "https://export.arxiv.org/api/query",
            params={
                "search_query": query,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
                "max_results": cfg.get("max_results", 60),
            },
        )
        resp.raise_for_status()
        for e in feedparser.parse(resp.content).entries:
            # Canonical abstract URL without version suffix, so v1/v2 dedupe.
            url = re.sub(r"v\d+$", "", e.get("id", "")).replace("http://", "https://")
            _make(
                items,
                title=clean_text(e.get("title"), 300),
                url=url,
                source="arXiv",
                published_at=_entry_date(e),
                raw_snippet=clean_text(e.get("summary")),
                bucket="A",
                max_age_hours=cfg.get("window_hours"),
            )
        log.info("arxiv                     %3d items", len(items))
    except Exception as exc:  # noqa: BLE001
        log.warning("arxiv FAILED: %s", exc)
    return items


# ── Hugging Face Daily Papers ───────────────────────────────────────────────


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def fetch_hf_daily_papers(client: httpx.Client) -> list[RawItem]:
    cfg = SOURCES.get("hf_daily_papers") or {}
    if not cfg.get("enabled"):
        return []
    items: list[RawItem] = []
    try:
        resp = client.get("https://huggingface.co/api/daily_papers", params={"limit": 100})
        resp.raise_for_status()
        for entry in resp.json():
            paper = entry.get("paper") or {}
            upvotes = int(paper.get("upvotes") or 0)
            if upvotes < cfg.get("min_upvotes", 0) or not paper.get("id"):
                continue
            _make(
                items,
                title=clean_text(paper.get("title") or entry.get("title"), 300),
                url=f"https://huggingface.co/papers/{paper['id']}",
                source="HF Daily Papers",
                # The day HF featured it — not the (older) arXiv publication date.
                published_at=_parse_iso(paper.get("submittedOnDailyAt") or entry.get("publishedAt")),
                raw_snippet=clean_text(paper.get("summary") or entry.get("summary")),
                bucket="A",
                signal=upvotes,
                max_age_hours=cfg.get("window_hours"),
            )
        log.info("hf daily papers           %3d items", len(items))
    except Exception as exc:  # noqa: BLE001
        log.warning("hf daily papers FAILED: %s", exc)
    return items


# ── Hacker News (Algolia) ───────────────────────────────────────────────────


def fetch_hackernews(client: httpx.Client) -> list[RawItem]:
    cfg = SOURCES.get("hackernews") or {}
    if not cfg.get("enabled"):
        return []
    items: list[RawItem] = []
    since = int((datetime.now(timezone.utc) - timedelta(hours=24)).timestamp())
    pattern = re.compile(r"\b(" + "|".join(cfg.get("keywords", [])) + r")\b", re.IGNORECASE)
    try:
        resp = client.get(
            "https://hn.algolia.com/api/v1/search_by_date",
            params={
                "tags": "story",
                "numericFilters": f"created_at_i>{since},points>{cfg.get('min_points', 50)}",
                "hitsPerPage": 300,
            },
        )
        resp.raise_for_status()
        hits = resp.json().get("hits", [])
        for h in hits:
            title = h.get("title") or ""
            if not pattern.search(title):
                continue
            hn_link = f"https://news.ycombinator.com/item?id={h['objectID']}"
            snippet = clean_text(h.get("story_text")) or f"{h.get('points', 0)} points, {h.get('num_comments', 0)} comments on Hacker News."
            _make(
                items,
                title=clean_text(title, 300),
                url=h.get("url") or hn_link,  # Ask HN / Show HN text posts have no external URL
                source="Hacker News",
                published_at=_parse_iso(h.get("created_at")),
                raw_snippet=snippet,
                bucket="A",
                signal=int(h.get("points") or 0),
            )
        log.info("hacker news               %3d items (of %d >%d pts)", len(items), len(hits), cfg.get("min_points", 50))
    except Exception as exc:  # noqa: BLE001
        log.warning("hacker news FAILED: %s", exc)
    return items


# ── Kaggle (Bucket B) ───────────────────────────────────────────────────────


def _kaggle_auth() -> dict:
    key = (os.getenv("KAGGLE_KEY") or os.getenv("KAGGLE_API_TOKEN") or "").strip()
    user = (os.getenv("KAGGLE_USERNAME") or "").strip()
    if key.startswith("KGAT_"):  # new-style API token → Bearer auth
        return {"headers": {"Authorization": f"Bearer {key}"}}
    if key and user:             # legacy kaggle.json key → HTTP basic auth
        return {"auth": (user, key)}
    return {}


def fetch_kaggle(client: httpx.Client) -> list[RawItem]:
    cfg = SOURCES.get("kaggle") or {}
    auth = _kaggle_auth()
    if not cfg.get("enabled") or not auth:
        return []
    items: list[RawItem] = []
    try:
        for page in range(1, cfg.get("pages", 1) + 1):
            resp = client.get(
                "https://www.kaggle.com/api/v1/competitions/list",
                params={"sortBy": "recentlyCreated", "page": page},
                **auth,
            )
            resp.raise_for_status()
            for c in resp.json():
                deadline = (c.get("deadline") or "")[:10] or None
                facts = [
                    f"Kaggle {c.get('category') or ''} competition hosted by {c.get('hostName') or c.get('organizationName') or 'Kaggle'}.",
                    f"Reward: {c['reward']}." if c.get("reward") else "",
                    f"Final submission deadline: {deadline}." if deadline else "",
                    f"Teams so far: {c['teamCount']}." if c.get("teamCount") is not None else "",
                    clean_text(c.get("description"), 400),
                ]
                _make(
                    items,
                    title=clean_text(c.get("title"), 300),
                    url=c.get("url") or c.get("ref") or "",
                    source="Kaggle",
                    # "recently created" ≈ recently opened to entrants
                    published_at=_parse_iso(c.get("enabledDate") or c.get("dateCreated")),
                    raw_snippet=" ".join(f for f in facts if f),
                    bucket="B",
                    known_deadline=deadline,  # structured API value: trusted over the LLM
                    category_hint="hackathon",
                    max_age_hours=cfg.get("window_hours"),
                    signal=int(c.get("teamCount") or 0),
                )
        log.info("kaggle                    %3d items", len(items))
    except Exception as exc:  # noqa: BLE001
        log.warning("kaggle FAILED: %s", exc)
    return items


# ── Tavily web search (Buckets B + C) ───────────────────────────────────────

_DATE_HINT = re.compile(
    r"(deadline|due|closes?|register|registration|submission|apply by|starts?|date|when|"
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}|\d{4}-\d{2}-\d{2}|"
    r"\b\d{1,2}(:\d{2})? ?(am|pm)\b|\b(utc|gmt|[ecmp][sd]?t|cet|ist)\b)",
    re.IGNORECASE,
)


def date_context(raw: str, limit: int = 600) -> str:
    """Excerpts around date-like phrases, so deadline/event evidence survives truncation."""
    raw = clean_text(raw, 20000)
    out, end = [], -1
    for m in _DATE_HINT.finditer(raw):
        if m.start() < end:
            continue
        a, b = max(0, m.start() - 90), min(len(raw), m.end() + 110)
        out.append(raw[a:b])
        end = b
        if sum(len(x) for x in out) > limit:
            break
    return " … ".join(out)[:limit + 200]


def fetch_tavily(client: httpx.Client) -> list[RawItem]:
    cfg = SOURCES.get("tavily") or {}
    key = os.getenv("TAVILY_API_KEY")
    if not cfg.get("enabled") or not key:
        return []
    items: list[RawItem] = []
    job_ok = _job_filter()
    for q in cfg.get("queries", []):
        body = {
            "query": q["q"],
            "search_depth": "basic",  # 1 credit
            "time_range": q.get("time_range") or cfg.get("time_range", "week"),
            "max_results": cfg.get("max_results", 6),
            "include_raw_content": True,
            "exclude_domains": cfg.get("exclude_domains", []),
        }
        if q.get("include_domains"):
            body["include_domains"] = q["include_domains"]
        try:
            resp = client.post("https://api.tavily.com/search", json=body, headers={"Authorization": f"Bearer {key}"}, timeout=40)
            resp.raise_for_status()
            results = resp.json().get("results", [])
            for r in results:
                if q.get("category") == "job" and not job_ok(r.get("title") or ""):
                    continue  # same seniority/topic filter as the job feeds
                snippet = clean_text(r.get("content"), 500)
                dates = date_context(r.get("raw_content") or "")
                _make(
                    items,
                    title=clean_text(r.get("title"), 300),
                    url=r.get("url", ""),
                    source=_domain_label(r.get("url", "")),
                    published_at=_parse_iso(r.get("published_date")),
                    raw_snippet=f"{snippet} [Date excerpts: {dates}]" if dates else snippet,
                    bucket=q["bucket"],
                    category_hint=q.get("category"),
                )
            log.info("tavily %-40s %2d results", q["q"][:40], len(results))
        except Exception as exc:  # noqa: BLE001
            log.warning("tavily %r FAILED: %s", q["q"], exc)
    return items


def _domain_label(url: str) -> str:
    host = re.sub(r"^www\.", "", httpx.URL(url).host) if url else "web"
    return {"lu.ma": "Luma", "luma.com": "Luma", "devpost.com": "Devpost", "lablab.ai": "lablab.ai",
            "eventbrite.com": "Eventbrite", "jobs.ashbyhq.com": "Ashby", "jobs.lever.co": "Lever",
            "boards.greenhouse.io": "Greenhouse", "job-boards.greenhouse.io": "Greenhouse",
            "apply.workable.com": "Workable"}.get(host, host)


# ── Jobs: Remotive API + job RSS feeds (Bucket C) ───────────────────────────


def _job_filter():
    cfg = SOURCES.get("jobs") or {}
    inc = re.compile(cfg.get("include", "."), re.IGNORECASE)
    exc = re.compile(cfg.get("exclude", r"^\b$"), re.IGNORECASE)
    return lambda title: bool(inc.search(title)) and not exc.search(title)


def fetch_remotive(client: httpx.Client) -> list[RawItem]:
    cfg = (SOURCES.get("jobs") or {}).get("remotive") or {}
    if not cfg.get("enabled"):
        return []
    keep = _job_filter()
    items: list[RawItem] = []
    try:
        for cat in cfg.get("categories", []):
            resp = client.get("https://remotive.com/api/remote-jobs", params={"category": cat, "limit": 60})
            resp.raise_for_status()
            for j in resp.json().get("jobs", []):
                title = clean_text(j.get("title"), 200)
                if not keep(title):
                    continue
                facts = (
                    f"{j.get('company_name')} — remote ({j.get('candidate_required_location') or 'location not stated'}), "
                    f"{(j.get('job_type') or '').replace('_', ' ')}. "
                    + (f"Salary: {j['salary']}. " if j.get("salary") else "")
                    + (f"Tags: {', '.join(j.get('tags') or [])[:150]}. " if j.get("tags") else "")
                    + clean_text(j.get("description"), 450)
                )
                _make(
                    items,
                    title=f"{title} at {j.get('company_name')}",
                    url=j.get("url", ""),
                    source="Remotive",
                    published_at=_parse_iso(j.get("publication_date")),
                    raw_snippet=facts,
                    bucket="C",
                    category_hint="job",
                )
        log.info("remotive                  %3d items", len(items))
    except Exception as exc:  # noqa: BLE001
        log.warning("remotive FAILED: %s", exc)
    return items


def fetch_job_feeds(client: httpx.Client) -> list[RawItem]:
    keep = _job_filter()
    items: list[RawItem] = []
    for feed in (SOURCES.get("jobs") or {}).get("rss", []):
        for it in _fetch_feed(client, feed["name"], feed["url"]):
            if keep(it.title):
                items.append(it.model_copy(update={"bucket": "C", "category_hint": "job"}))
    return items


# ── Tools & Resources: HF models/datasets, new GitHub repos, Kaggle datasets ──


def _resources_cfg() -> dict:
    return SOURCES.get("resources") or {}


def _resource_window() -> int:
    return int(_resources_cfg().get("window_days", 21)) * 24


_FRONTMATTER = re.compile(r"^---.*?---", re.DOTALL)
_MD_NOISE = re.compile(r"!\[[^\]]*\]\([^)]*\)|<[^>]+>|\[([^\]]*)\]\([^)]*\)|[#*`>|]+")


def readme_intro(markdown: str, limit: int = 600) -> str:
    """First prose of a model card: drop YAML front-matter, images, HTML, link targets, markup."""
    text = _FRONTMATTER.sub("", markdown, count=1)
    text = _MD_NOISE.sub(lambda m: m.group(1) or " ", text)
    return clean_text(text, limit)


def fetch_hf_models(client: httpx.Client) -> list[RawItem]:
    cfg = _resources_cfg().get("hf_models") or {}
    if not cfg.get("enabled"):
        return []
    items: list[RawItem] = []
    skip = re.compile(cfg.get("skip_pattern", r"^$"), re.IGNORECASE)
    try:
        resp = client.get("https://huggingface.co/api/models", params={"sort": "trendingScore", "limit": cfg.get("limit", 30)})
        resp.raise_for_status()
        models = [m for m in resp.json() if int(m.get("likes") or 0) >= cfg.get("min_likes", 0) and not skip.search(m.get("id", ""))]
        for rank, m in enumerate(models):
            readme = ""
            if rank < cfg.get("readme_top", 10):
                try:
                    r = client.get(f"https://huggingface.co/{m['id']}/raw/main/README.md", timeout=10)
                    if r.status_code == 200:
                        readme = readme_intro(r.text)
                except httpx.HTTPError:
                    pass  # gated or slow card: the tags below still describe it
            tags = [t for t in (m.get("tags") or []) if ":" not in t][:8]
            facts = (
                f"Open model on Hugging Face: {m.get('pipeline_tag') or 'model'}"
                + (f", library {m['library_name']}" if m.get("library_name") else "")
                + f". {m.get('likes', 0)} likes, {m.get('downloads', 0)} downloads this month."
                + (f" Tags: {', '.join(tags)}." if tags else "")
            )
            _make(
                items,
                title=m["id"],
                url=f"https://huggingface.co/{m['id']}",
                source="HF Models",
                published_at=_parse_iso(m.get("createdAt")),
                raw_snippet=f"{facts} {readme}".strip(),
                bucket="A",
                category_hint="resource",
                signal=int(m.get("likes") or 0),
                max_age_hours=_resource_window(),
            )
        log.info("hf trending models        %3d items", len(items))
    except Exception as exc:  # noqa: BLE001
        log.warning("hf trending models FAILED: %s", exc)
    return items


def fetch_hf_datasets(client: httpx.Client) -> list[RawItem]:
    cfg = _resources_cfg().get("hf_datasets") or {}
    if not cfg.get("enabled"):
        return []
    items: list[RawItem] = []
    try:
        resp = client.get("https://huggingface.co/api/datasets", params={"sort": "trendingScore", "limit": cfg.get("limit", 20)})
        resp.raise_for_status()
        for d in resp.json():
            if int(d.get("likes") or 0) < cfg.get("min_likes", 0):
                continue
            _make(
                items,
                title=d["id"],
                url=f"https://huggingface.co/datasets/{d['id']}",
                source="HF Datasets",
                published_at=_parse_iso(d.get("createdAt")),
                raw_snippet=f"Dataset on Hugging Face. {d.get('likes', 0)} likes, {d.get('downloads', 0)} downloads. "
                + readme_intro(d.get("description") or "", 600),
                bucket="A",
                category_hint="resource",
                signal=int(d.get("likes") or 0),
                max_age_hours=_resource_window(),
            )
        log.info("hf trending datasets      %3d items", len(items))
    except Exception as exc:  # noqa: BLE001
        log.warning("hf trending datasets FAILED: %s", exc)
    return items


def fetch_github_repos(client: httpx.Client) -> list[RawItem]:
    cfg = _resources_cfg().get("github") or {}
    if not cfg.get("enabled"):
        return []
    items: list[RawItem] = []
    seen: set[str] = set()
    since = (datetime.now(timezone.utc) - timedelta(days=cfg.get("created_within_days", 14))).date().isoformat()
    headers = {"Accept": "application/vnd.github+json"}
    if os.getenv("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    for topic in cfg.get("topics", []):
        try:
            resp = client.get(
                "https://api.github.com/search/repositories",
                params={"q": f"topic:{topic} created:>{since} stars:>={cfg.get('min_stars', 50)}", "sort": "stars",
                        "order": "desc", "per_page": cfg.get("per_topic", 8)},
                headers=headers,
            )
            resp.raise_for_status()
            for r in resp.json().get("items", []):
                if r["full_name"] in seen or r.get("fork") or r.get("archived") or not r.get("description"):
                    continue
                seen.add(r["full_name"])
                _make(
                    items,
                    title=r["full_name"],
                    url=r["html_url"],
                    source="GitHub",
                    published_at=_parse_iso(r.get("created_at")),
                    raw_snippet=(
                        f"New open-source repository ({r.get('language') or 'language not stated'}), "
                        f"{r.get('stargazers_count', 0)} stars since {r.get('created_at', '')[:10]}. "
                        f"Topics: {', '.join((r.get('topics') or [])[:8])}. {clean_text(r.get('description'), 400)}"
                    ),
                    bucket="A",
                    category_hint="resource",
                    signal=int(r.get("stargazers_count") or 0),
                    max_age_hours=_resource_window(),
                )
        except Exception as exc:  # noqa: BLE001
            log.warning("github topic:%s FAILED: %s", topic, exc)
    log.info("github new repos          %3d items", len(items))
    return items


def fetch_kaggle_datasets(client: httpx.Client) -> list[RawItem]:
    cfg = _resources_cfg().get("kaggle_datasets") or {}
    auth = _kaggle_auth()
    if not cfg.get("enabled") or not auth:
        return []
    items: list[RawItem] = []
    try:
        resp = client.get("https://www.kaggle.com/api/v1/datasets/list", params={"sortBy": "hottest", "page": 1}, **auth)
        resp.raise_for_status()
        for d in resp.json()[: cfg.get("limit", 15)]:
            _make(
                items,
                title=clean_text(d.get("title"), 200),
                url=d.get("url") or f"https://www.kaggle.com/datasets/{d.get('ref')}",
                source="Kaggle Datasets",
                published_at=_parse_iso(d.get("lastUpdated")),
                raw_snippet=(
                    f"Kaggle dataset by {d.get('creatorName') or d.get('ownerName') or 'a Kaggle user'}. "
                    f"{d.get('voteCount', 0)} votes, {d.get('downloadCount', 0)} downloads, "
                    f"usability {float(d.get('usabilityRating') or 0):.1f}/1. "
                    f"{clean_text(d.get('subtitle'), 200)} {clean_text(d.get('description'), 400)}"
                ),
                bucket="A",
                category_hint="resource",
                signal=int(d.get("voteCount") or 0),
                max_age_hours=_resource_window(),
            )
        log.info("kaggle datasets           %3d items", len(items))
    except Exception as exc:  # noqa: BLE001
        log.warning("kaggle datasets FAILED: %s", exc)
    return items


# ── Entry point ─────────────────────────────────────────────────────────────

FETCHERS = {
    "rss": fetch_rss,
    "arxiv": fetch_arxiv,
    "hf_daily_papers": fetch_hf_daily_papers,
    "hackernews": fetch_hackernews,
    "kaggle": fetch_kaggle,
    "tavily": fetch_tavily,
    "remotive": fetch_remotive,
    "job_feeds": fetch_job_feeds,
    "hf_models": fetch_hf_models,
    "hf_datasets": fetch_hf_datasets,
    "github": fetch_github_repos,
    "kaggle_datasets": fetch_kaggle_datasets,
}


def ingest_all() -> list[RawItem]:
    with _client() as client, ThreadPoolExecutor(max_workers=len(FETCHERS)) as pool:
        futures = {name: pool.submit(fn, client) for name, fn in FETCHERS.items()}
        items = [item for f in futures.values() for item in f.result()]
    log.info("ingested %d raw items total", len(items))
    return items
