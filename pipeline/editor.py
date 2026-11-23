"""Stage 3 — AI Editor-in-Chief (Gemini + Pydantic structured outputs).

Anti-hallucination contract:
  * The LLM never emits URLs. It references input items by integer id; the URL
    is copied from the ingested item. Unknown ids → story dropped.
  * A deadline is kept only if the LLM also returns a verbatim quote that
    fuzzy-matches the source text, and the date is in the future. Deadlines from
    structured APIs (e.g. Kaggle) always override the LLM.
  * Every response is validated against the Pydantic schema; bad batches are
    retried, then skipped (logged), never guessed.
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone

import httpx
from pydantic import ValidationError
from rapidfuzz import fuzz

from .config import SOURCES, settings
from .models import Article, EditedStory, EditorResponse, Edition, RawItem

log = logging.getLogger("editor")

SYSTEM_PROMPT = """You are the Editor-in-Chief of a daily, no-hype intelligence briefing for an
EARLY-CAREER data scientist / AI engineer (skills: Python, ML, deep learning, LLMs,
data engineering, SQL, business intelligence and analytics such as Power BI, DAX, Fabric,
dbt and data visualization; goals: learn what matters, ship projects, get hired).
BI and analytics are core to this reader, not "loosely related": score them like ML news.

You receive a JSON list of candidate items, each with an integer "id".
Return ONLY stories worth this reader's limited time.

Scoring rubric (relevance_score, 1-10):
  9-10  Major model/tool release, landmark paper, or industry shift the reader must know today.
  7-8   Solid, practical, or educational: usable open-source tools/models, strong tutorials,
        notable research with clear applications, meaningful industry news.
  4-6   Niche, incremental, or only loosely related to data/AI work.
  1-3   Hype, marketing, funding gossip without substance, opinion fluff, off-topic.

Research papers get a stricter bar — this reader is a practitioner, not a theorist:
  - 7+ ONLY if the paper gives something usable: released code/model/dataset, a technique
    a practitioner could apply now, a benchmark that changes tool choices, or a result the
    whole field will talk about.
  - Pure theory, proofs, convergence/minimax bounds, or narrow domain applications: 6 or lower,
    however rigorous.

Rules:
  - CLUSTER: if several items cover the same announcement, return ONE story listing all
    their ids in source_ids; set primary_id to the most authoritative (official blog or
    paper beats aggregator/discussion).
  - Every id you use MUST come from the input. Never invent ids, facts, numbers, or dates.
  - Write from the input text only. If the snippet is thin, keep the copy modest and factual.
  - title: neutral and specific (who + what). No "revolutionary", "game-changer", emojis, or questions.
  - what_happened: exactly 2 sentences. why_it_matters: exactly 1 sentence, concrete for this reader.
  - deadline: only if the input explicitly states one; copy the exact supporting text into
    deadline_evidence. Otherwise both null. Same for event_start / event_timezone / is_remote.
  - You may return stories with any score; low scores are filtered downstream.
"""

JOB_LEVELS = ("internship", "entry", "mid", "senior")
# Normalise whatever wording the model uses onto the four stored levels.
_LEVEL_ALIASES = {
    "intern": "internship", "internship": "internship", "co-op": "internship", "apprentice": "internship",
    "entry": "entry", "entry-level": "entry", "entry level": "entry", "junior": "entry", "graduate": "entry",
    "new grad": "entry", "new-grad": "entry", "associate": "entry",
    "mid": "mid", "mid-level": "mid", "mid level": "mid", "intermediate": "mid",
    "senior": "senior", "sr": "senior", "lead": "senior", "staff": "senior", "principal": "senior",
}


def normalize_job_level(value: str | None) -> str | None:
    return _LEVEL_ALIASES.get((value or "").strip().lower().rstrip("."))

# Appended to SYSTEM_PROMPT for each editorial group (see editorial_groups()).
GROUP_RULES = {
    "hackathon": """
THIS BATCH: HACKATHONS & COMPETITIONS.
  - Keep only a SPECIFIC hackathon/competition that is open or upcoming and that an individual
    early-career person can join ONLINE (or hybrid with online participation).
  - Score 3 or lower: directory/listing pages, blog posts, articles, tutorials, past events,
    events restricted to high-school students or to one university/country's members, in-person-only events.
  - Title: "<Event name> (<host>)". what_happened: format, theme, prizes, eligibility. why_it_matters: the skill/portfolio payoff.
  - deadline = registration or submission close; event_start = kickoff. Each ONLY with verbatim evidence.
  - event_format: online / hybrid / in_person as stated.
""",
    "job": """
THIS BATCH: JOB POSTINGS.
  - Target: remote or remote-friendly roles AT ANY LEVEL (internship, entry, mid, senior) in data science,
    machine learning, AI engineering, data engineering, MLOps, or analytics.
  - Score by role quality and fit with the field, NOT by seniority: a clear, well-described senior ML role
    scores as high as a good internship.
  - Score 3 or lower: executive roles (director, VP, head of, chief), non-data roles, on-site-only roles,
    pages that are not one specific job, postings with no real description.
  - title: the ROLE TITLE ONLY (no company), e.g. "Machine Learning Engineer, Search".
  - company: the hiring company's name as stated. location: where the role can be done, as stated
    (e.g. "Remote (US)", "Remote, EMEA", "Berlin or remote"); null if not stated.
  - job_level: internship / entry / mid / senior. Map junior/graduate/new-grad to entry; lead/staff/principal
    to senior. Use stated title words and years of experience; null only if truly unclear.
  - what_happened: scope + key requirements (stack, years). why_it_matters: who it suits and why.
  - is_remote from the text. deadline only if an application close date is stated.
""",
    "resources": """
THIS BATCH: TOOLS & RESOURCES — open-source repositories, models, datasets, benchmarks.
  - Keep things a data scientist / ML engineer can USE now: libraries and tools, open models with
    usable weights, quality datasets, benchmarks/evals, practical learning material.
  - Judge substance, not popularity: star or like counts can be inflated. A clear description of what it
    does, who made it, and a real use case matter more.
  - Score 3 or lower: promotional or vague repos, crypto/trading bots, "awesome" link dumps without curation,
    personal configs, competition data dumps useful only inside one Kaggle contest, NSFW, duplicates of a
    model already in the batch.
  - title: "<name>: <what it is in a few words>", e.g. "Inkling-2-Mini: open 7B vision-language model".
  - what_happened: what it is + who released it + one concrete capability or spec from the input.
    why_it_matters: the practical use for this reader. Never invent benchmarks, sizes or licences.
""",
    "webinar": """
THIS BATCH: WEBINARS, WORKSHOPS & LIVE EVENTS.
  - Keep only a SPECIFIC, UPCOMING, ONLINE (or hybrid with online access) TECHNICAL event about data/ML/AI
    that teaches skills (talks, workshops, live coding, office hours).
  - Score 3 or lower: in-person-only meetups, networking/investor/sales events, marketing/SEO, paid bootcamp ads,
    app-store or calendar listing pages, past events.
  - Title: "<Event name> (<host>)". event_start: ISO 8601 with time if stated; event_timezone as stated;
    event_evidence: the verbatim date text. event_format: online / hybrid / in_person.
""",
}

# ── Gemini call ─────────────────────────────────────────────────────────────


class EditorError(RuntimeError):
    pass


class FatalEditorError(EditorError):
    """Config problems (bad key / model) — abort the run instead of skipping batches."""


def _gemini_client():
    """Gemini client, or None when only Groq is configured."""
    if not settings.gemini_api_key:
        if settings.groq_api_key:
            return None
        raise FatalEditorError("No LLM key set: add GEMINI_API_KEY (and/or GROQ_API_KEY) to .env, or run with --no-llm.")
    from google import genai  # imported lazily so --no-llm works without the SDK configured
    from google.genai import types

    # Hard per-request timeout: an overloaded model once took 8+ minutes to answer.
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=int(settings.llm_timeout_seconds * 1000)),
    )


# Run-level state: which Gemini model last worked, and whether Gemini is down for this run.
_preferred_model: str | None = None
_gemini_down = False


def _call_gemini(client, prompt: str, schema, system: str, retries: int = 2):
    from google.genai import types

    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=0.2,
    )
    global _preferred_model
    chain = settings.model_chain
    start = chain.index(_preferred_model) if _preferred_model in chain else 0
    last_exc: Exception | None = None

    for model in chain[start:]:
        for attempt in range(1, retries + 1):
            try:
                resp = client.models.generate_content(model=model, contents=prompt, config=config)
                result = schema.model_validate_json(resp.text or "")
                if model != _preferred_model:
                    log.info("using model %s", model)
                    _preferred_model = model  # sticky: later batches skip the overloaded model
                return result
            except ValidationError as exc:
                last_exc = exc
                log.warning("%s attempt %d: response failed schema validation: %s", model, attempt, str(exc)[:200])
            except Exception as exc:  # noqa: BLE001 — network / 429 / 5xx
                last_exc = exc
                msg = str(exc)
                if "API_KEY_INVALID" in msg or "PERMISSION_DENIED" in msg:
                    raise FatalEditorError("Gemini rejected the API key - check GEMINI_API_KEY in .env.") from exc
                if "NOT_FOUND" in msg and "model" in msg.lower():
                    log.warning("model %s not available to this key; trying next", model)
                    break
                if "DEADLINE_EXCEEDED" in msg or "504" in msg or "timed out" in msg.lower() or isinstance(exc, httpx.TimeoutException):
                    log.warning("%s timed out after %ss; trying next model", model, settings.llm_timeout_seconds)
                    break  # a hung model rarely recovers within the same run
                if attempt == retries:
                    break
                quota = "429" in msg or "RESOURCE_EXHAUSTED" in msg
                wait = (20 if quota else 8) * attempt
                log.warning("%s attempt %d: %s; retrying in %ds", model, attempt, msg[:90], wait)
                time.sleep(wait)
        log.warning("model %s gave up (%s); falling back", model, str(last_exc)[:90])
    raise EditorError(f"all Gemini models failed ({', '.join(chain[start:])}): {str(last_exc)[:200]}")


# ── Groq (OpenAI-compatible) — cross-provider fallback ──────────────────────


def strict_json_schema(model_cls) -> dict:
    """Pydantic JSON schema → Groq strict-mode schema.

    Strict mode requires every property in `required` and additionalProperties=false
    on every object; optional fields stay nullable via anyOf [..., null].
    """

    def fix(node, is_properties_map: bool = False):
        if isinstance(node, dict):
            if is_properties_map:  # keys here are field names (e.g. a field called "title") — keep them all
                return {k: fix(v) for k, v in node.items()}
            node = {k: fix(v, k in ("properties", "$defs")) for k, v in node.items() if k not in ("default", "title")}
            if node.get("type") == "object" and "properties" in node:
                node["required"] = list(node["properties"])
                node["additionalProperties"] = False
            return node
        if isinstance(node, list):
            return [fix(v) for v in node]
        return node

    return fix(model_cls.model_json_schema())


def _call_groq(prompt: str, schema, system: str, retries: int = 3):
    if not settings.groq_api_key:
        raise EditorError("GROQ_API_KEY not set")
    body = {
        "model": settings.groq_model,
        "temperature": 0.2,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema.__name__, "strict": True, "schema": strict_json_schema(schema)},
        },
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    last_err = ""
    attempt = rate_waits = 0
    while attempt < retries:
        try:
            resp = httpx.post(GROQ_URL, json=body, headers=headers, timeout=settings.llm_timeout_seconds)
        except httpx.HTTPError as exc:
            last_err = f"network error: {exc}"
        else:
            if resp.status_code == 200:
                try:
                    return schema.model_validate_json(resp.json()["choices"][0]["message"]["content"] or "")
                except (ValidationError, KeyError, IndexError) as exc:
                    last_err = f"schema validation failed: {str(exc)[:150]}"
            elif resp.status_code in (401, 403):
                raise FatalEditorError("Groq rejected the API key - check GROQ_API_KEY in .env.")
            elif resp.status_code == 404:
                raise FatalEditorError(f"Groq model '{settings.groq_model}' not found - set GROQ_MODEL in .env.")
            else:
                last_err = f"HTTP {resp.status_code}: {resp.text[:150]}"
                if _groq_oversize(resp):
                    # One request bigger than the per-minute budget: waiting can't help, a smaller chunk can.
                    raise EditorError(f"Groq request too large: {resp.text[:150]}")
                if resp.status_code == 429 and rate_waits < 4:
                    # Budget temporarily used up: wait as told. Doesn't count as a failed attempt.
                    rate_waits += 1
                    wait = min(float(resp.headers.get("retry-after", 20)) + 1, 90)
                    log.warning("groq rate-limited; waiting %.0fs", wait)
                    time.sleep(wait)
                    continue
        attempt += 1
        log.warning("groq attempt %d: %s", attempt, last_err)
        if attempt < retries:
            time.sleep(5 * attempt)
    raise EditorError(f"Groq failed after {retries} attempts: {last_err}")


def _groq_oversize(resp: httpx.Response) -> bool:
    """413, or a 429 whose message says the request alone exceeds the limit."""
    if resp.status_code == 413:
        return True
    if resp.status_code != 429:
        return False
    text = resp.text
    if "Request too large" in text:
        return True
    m = re.search(r"Limit (\d+),.*?Requested (\d+)", text)
    return bool(m and int(m.group(2)) > int(m.group(1)))


GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def _call_structured(client, prompt: str, schema, system: str = SYSTEM_PROMPT, retries: int = 3):
    """Gemini first (with its model fallback chain), then Groq. Used for small prompts."""
    global _gemini_down
    if client is not None and not _gemini_down:
        try:
            return _call_gemini(client, prompt, schema, system, retries)
        except FatalEditorError:
            raise
        except EditorError as exc:
            if not settings.groq_api_key:
                raise
            log.warning("%s -> switching to Groq for the rest of this run", exc)
            _gemini_down = True
    return _call_groq(prompt, schema, system, retries)


# ── Verification ────────────────────────────────────────────────────────────


def _evidence_ok(evidence: str | None, sources: list[RawItem]) -> bool:
    if not evidence or len(evidence.strip()) < 6:
        return False
    haystack = " ".join(f"{s.title} {s.raw_snippet}" for s in sources).lower()
    return fuzz.partial_ratio(evidence.lower().strip(), haystack) >= 90


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _parse_dt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return None


_TYPOGRAPHY = str.maketrans({"‑": "-", "‐": "-", " ": " ", " ": " "})


def _clean_field(value: str | None, limit: int) -> str | None:
    """Short free-text fields (company, location): trimmed, typography-normalised, None if empty."""
    value = (value or "").translate(_TYPOGRAPHY).strip().strip(".")
    return value[:limit] or None if value.lower() not in ("null", "none", "n/a", "unknown", "not stated") else None


def strip_inline_latex(text: str) -> str:
    """"$R^2$" -> "R^2", but leave prices alone ("$67,500 ... $25,000")."""
    def repl(m: re.Match) -> str:
        inner = m.group(1)
        return inner if re.search(r"[\\^_{}]", inner) or re.fullmatch(r"[A-Za-z]", inner) else m.group(0)

    return re.sub(r"\$([^$\n]{1,60})\$", repl, text)


def _first_sentences(text: str, n: int) -> str:
    text = strip_inline_latex(text.translate(_TYPOGRAPHY))
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n])


def verify_story(story: EditedStory, batch: dict[int, RawItem], today: date) -> Article | None:
    """Turn an LLM story into a trusted Article, or None if it fails verification."""
    ids = [i for i in dict.fromkeys(story.source_ids + [story.primary_id]) if i in batch]
    if story.primary_id not in batch or not ids:
        log.warning("dropping story with unknown primary_id=%s (%r)", story.primary_id, story.title[:60])
        return None
    primary = batch[story.primary_id]
    sources = [batch[i] for i in ids]

    score = max(1, min(10, story.relevance_score))

    # Deadline: structured API value wins; else LLM value must be evidenced + plausible.
    deadline: date | None = _parse_date(primary.known_deadline)
    if deadline is None and story.deadline:
        candidate = _parse_date(story.deadline)
        if candidate and today <= candidate <= today + timedelta(days=400) and _evidence_ok(story.deadline_evidence, sources):
            deadline = candidate
        else:
            log.info("rejected unverified deadline %r for %r", story.deadline, story.title[:60])

    # Event start: same evidence rule as deadlines.
    event_start: str | None = None
    if story.event_start:
        parsed = _parse_dt(story.event_start)
        if parsed and _evidence_ok(story.event_evidence, sources):
            event_start = parsed
        else:
            log.info("rejected unverified event_start %r for %r", story.event_start, story.title[:60])

    related = [str(s.url) for s in sources if s is not primary]
    for s in sources:
        related += s.related_urls
    category = primary.category_hint or {"A": "research", "B": "hackathon", "C": "job"}[primary.bucket]

    # Opportunities must be actionable: a hackathon/webinar needs a verified date that hasn't passed.
    if category in ("hackathon", "webinar"):
        upcoming = (deadline and deadline >= today) or (event_start and date.fromisoformat(event_start[:10]) >= today)
        if not upcoming:
            log.info("dropping %s without a verified upcoming date: %r", category, story.title[:60])
            return None
    job_level = normalize_job_level(story.job_level)
    event_format = (story.event_format or "").strip().lower().replace("-", "_").replace(" ", "_") or None
    event_format = event_format if event_format in ("online", "hybrid", "in_person") else None
    # Hard rules, enforced in code so they hold whichever model is editing (the
    # lighter fallbacks follow the prompt less strictly). Unknown (None) passes.
    if category == "job" and story.is_remote is False:
        log.info("dropping on-site job: %r", story.title[:60])
        return None
    if category in ("hackathon", "webinar") and (event_format == "in_person" or (story.is_remote is False and event_format != "hybrid")):
        log.info("dropping in-person-only %s: %r", category, story.title[:60])
        return None

    return Article(
        category=category,
        title=story.title.translate(_TYPOGRAPHY).strip(),
        what_happened=_first_sentences(story.what_happened, 2),
        why_it_matters=_first_sentences(story.why_it_matters, 1),
        url=str(primary.url),
        source=primary.source,
        relevance_score=score,
        tags=[t.lower().strip().replace(" ", "-") for t in story.tags][:5],
        deadline=deadline.isoformat() if deadline else None,
        related_urls=list(dict.fromkeys(u for u in related if u != str(primary.url))),
        event_start=event_start,
        event_timezone=story.event_timezone if event_start else None,
        is_remote=story.is_remote,
        event_format=event_format,
        job_level=job_level if category == "job" else None,
        company=_clean_field(story.company, 100) if category == "job" else None,
        location=_clean_field(story.location, 100) if category == "job" else None,
        published_at=primary.published_at,
        bucket=primary.bucket,
    )


# ── Orchestration ───────────────────────────────────────────────────────────


def _batch_prompt(batch: dict[int, RawItem]) -> str:
    payload = [
        {
            "id": i,
            "title": it.title,
            "source": it.source,
            "published_at": it.published_at.date().isoformat() if it.published_at else None,
            "snippet": it.raw_snippet,
            "also_covered_by": len(it.related_urls),
        }
        for i, it in batch.items()
    ]
    return "Candidate items:\n" + json.dumps(payload, ensure_ascii=False, indent=1)


def estimate_tokens(text: str) -> int:
    """Rough token count (~3.5 chars/token for English + JSON); errs on the high side."""
    return int(len(text) / 3.5) + 1


def groq_chunks(batch: dict[int, RawItem], system: str) -> list[dict[int, RawItem]]:
    """Split a batch so each Groq request stays under the free tier's tokens-per-minute
    budget (sized by estimated tokens, since job/event snippets vary a lot in length)."""
    budget = settings.groq_max_input_tokens - estimate_tokens(system)
    chunks: list[dict[int, RawItem]] = []
    current: dict[int, RawItem] = {}
    for k, it in batch.items():
        candidate = {**current, k: it}
        too_big = estimate_tokens(_batch_prompt(candidate)) > budget
        if current and (too_big or len(current) >= settings.groq_batch_size):
            chunks.append(current)
            candidate = {k: it}
        current = candidate
    if current:
        chunks.append(current)
    return chunks


_SPLITTABLE = ("JSON", "too large")  # errors a smaller chunk can fix


def _groq_split(chunk: dict[int, RawItem], system: str) -> list[EditedStory]:
    """Groq sometimes can't produce schema-valid JSON for a large, messy chunk, or rejects a
    request as larger than its per-minute token limit. Halve the chunk and retry, down to 1 item."""
    try:
        return _call_groq(_batch_prompt(chunk), EditorResponse, system, retries=2).stories
    except FatalEditorError:
        raise
    except EditorError as exc:
        if not any(s in str(exc) for s in _SPLITTABLE) or len(chunk) <= 1:
            raise
        keys = list(chunk)
        half = len(keys) // 2
        log.warning("groq %s on %d items; retrying as %d + %d",
                    "oversize" if "too large" in str(exc) else "JSON failure", len(keys), half, len(keys) - half)
        out: list[EditedStory] = []
        for part in (keys[:half], keys[half:]):
            time.sleep(settings.groq_pause_seconds)
            try:
                out += _groq_split({k: chunk[k] for k in part}, system)
            except FatalEditorError:
                raise
            except EditorError as sub_exc:
                log.error("groq sub-chunk of %d items skipped: %s", len(part), str(sub_exc)[:150])
        return out


def _edit_batch(client, batch: dict[int, RawItem], system: str = SYSTEM_PROMPT) -> list[EditedStory]:
    """One editorial batch: Gemini on the whole batch, else Groq in smaller chunks.

    Groq's free tier allows ~8K tokens/min, so a 40-item batch is split. Clustering
    then only happens within a chunk; _dedupe_articles() catches cross-chunk repeats.
    """
    global _gemini_down
    if client is not None and not _gemini_down:
        try:
            return _call_gemini(client, _batch_prompt(batch), EditorResponse, system).stories
        except FatalEditorError:
            raise
        except EditorError as exc:
            if not settings.groq_api_key:
                raise
            log.warning("%s -> switching to Groq for the rest of this run", exc)
            _gemini_down = True

    stories: list[EditedStory] = []
    failures = 0
    chunks = groq_chunks(batch, system)
    for n, chunk in enumerate(chunks):
        if n:
            time.sleep(settings.groq_pause_seconds)
        try:
            stories += _groq_split(chunk, system)
        except FatalEditorError:
            raise
        except EditorError as exc:
            failures += 1
            log.error("groq chunk of %d items skipped: %s", len(chunk), exc)
    if failures and not stories:
        raise EditorError(f"all {failures} Groq chunks failed")
    log.info("groq (%s) edited %d items in %d chunks", settings.groq_model, len(batch), len(chunks))
    return stories


def edit_items(items: list[RawItem], today: date | None = None) -> tuple[list[Article], dict[str, int]]:
    global _preferred_model, _gemini_down
    _preferred_model, _gemini_down = None, False  # fresh provider state per run
    today = today or datetime.now(timezone.utc).date()
    client = _gemini_client()
    articles: list[Article] = []
    stats = {"llm_calls": 0, "llm_failed_batches": 0, "stories_returned": 0, "stories_unverified": 0, "below_threshold": 0}

    for bucket, bucket_items in editorial_groups(items):  # bucket = group label: news/papers/hackathon/job/webinar
        system = f"Today's date is {today.isoformat()}.\n\n" + SYSTEM_PROMPT + GROUP_RULES.get(bucket, "")
        size = settings.llm_batch_size
        for start in range(0, len(bucket_items), size):
            # Global ids (offset by `start`) keep log messages traceable across batches.
            batch = {start + n: it for n, it in enumerate(bucket_items[start : start + size])}
            if stats["llm_calls"]:
                time.sleep(settings.llm_pause_seconds)
            stats["llm_calls"] += 1
            try:
                stories = _edit_batch(client, batch, system)
            except FatalEditorError:
                raise
            except EditorError as exc:
                stats["llm_failed_batches"] += 1
                log.error("bucket %s batch %d skipped: %s", bucket, start // size, exc)
                continue
            stats["stories_returned"] += len(stories)
            for story in stories:
                art = verify_story(story, batch, today)
                if art is None:
                    stats["stories_unverified"] += 1
                elif art.relevance_score < settings.min_relevance:
                    stats["below_threshold"] += 1
                else:
                    articles.append(art)
            log.info("bucket %s batch %d: %d items -> %d stories kept so far", bucket, start // size, len(batch), len(articles))

    if stats["llm_calls"] and stats["llm_failed_batches"] == stats["llm_calls"]:
        raise FatalEditorError(f"every LLM batch failed ({stats['llm_calls']}); not publishing an empty edition")
    articles = _dedupe_articles(articles)
    articles, stats["papers_capped"] = cap_papers(articles)
    articles, stats["source_capped"] = cap_per_source(articles)
    return articles, stats


def _editorial_cfg() -> dict:
    return SOURCES.get("editorial") or {}


def is_paper(source: str) -> bool:
    return source in _editorial_cfg().get("paper_sources", ["arXiv", "HF Daily Papers"])


def editorial_groups(items: list[RawItem]) -> list[tuple[str, list[RawItem]]]:
    """Bucket A is split into news and papers so each is scored against its peers
    (a pile of papers otherwise crowds out industry news). News goes first."""
    def cat(i: RawItem) -> str:
        return i.category_hint or {"B": "hackathon", "C": "job"}.get(i.bucket, "research")

    groups = [
        ("news", [i for i in items if i.bucket == "A" and not is_paper(i.source) and i.category_hint != "resource"]),
        ("papers", [i for i in items if i.bucket == "A" and is_paper(i.source)]),
        ("resources", [i for i in items if i.bucket == "A" and i.category_hint == "resource"]),
        ("hackathon", [i for i in items if i.bucket != "A" and cat(i) == "hackathon"]),
        ("job", [i for i in items if i.bucket != "A" and cat(i) == "job"]),
        ("webinar", [i for i in items if i.bucket != "A" and cat(i) == "webinar"]),
    ]
    return [(b, g) for b, g in groups if g]


def cap_per_source(articles: list[Article]) -> tuple[list[Article], int]:
    """Diversity: at most `max_per_source` stories from any one source (highest relevance kept).
    Papers have their own cap; jobs and hackathons are separate opportunities, so exempt."""
    cfg = _editorial_cfg()
    limit = int(cfg.get("max_per_source", 2))
    exempt = set(cfg.get("cap_exempt_categories", ["job", "hackathon"]))
    kept: list[Article] = []
    per_source: dict[str, int] = {}
    dropped = 0
    for a in sorted(articles, key=lambda a: -a.relevance_score):
        if a.category in exempt or is_paper(a.source):
            kept.append(a)
            continue
        if per_source.get(a.source, 0) >= limit:
            dropped += 1
            continue
        per_source[a.source] = per_source.get(a.source, 0) + 1
        kept.append(a)
    return kept, dropped


def cap_papers(articles: list[Article]) -> tuple[list[Article], int]:
    """Keep at most `max_papers` papers (highest relevance; curated HF beats raw arXiv on ties)."""
    limit = int(_editorial_cfg().get("max_papers", 8))
    papers = sorted(
        (a for a in articles if is_paper(a.source)),
        key=lambda a: (-a.relevance_score, a.source != "HF Daily Papers"),
    )
    dropped = {id(a) for a in papers[limit:]}
    return [a for a in articles if id(a) not in dropped], len(dropped)


def _identity(a: Article) -> str:
    # A job's title is the role alone ("Senior Data Engineer"), so the company is part of its identity.
    return f"{a.title} @ {a.company}".lower() if a.category == "job" else a.title.lower()


def _same_story(a: Article, b: Article) -> bool:
    if a.url == b.url:
        return True
    if a.bucket != b.bucket:
        return False
    if a.bucket == "A":  # news: reworded headlines of one story
        return fuzz.token_set_ratio(_identity(a), _identity(b)) >= 90
    return fuzz.ratio(_identity(a), _identity(b)) >= 95  # jobs/events: near-identical only


def _dedupe_articles(articles: list[Article]) -> list[Article]:
    """Cross-batch safety net: same URL or the same story twice → keep the higher score."""
    out: list[Article] = []
    for art in sorted(articles, key=lambda a: -a.relevance_score):
        if any(_same_story(a, art) for a in out):
            continue
        out.append(art)
    return out


def assign_front_page(articles: list[Article], min_n: int = 3, max_n: int = 5) -> list[Article]:
    """Promote the strongest Bucket A stories to the front page (3–5 heroes), at most one per source.
    Tools & resources only make the front page when exceptional (score 9+); otherwise they stay in
    their own section, so a quiet news day doesn't fill the front page with repos and model uploads."""
    news = sorted(
        (a for a in articles if a.bucket == "A" and (a.category != "resource" or a.relevance_score >= 9)),
        key=lambda a: -a.relevance_score,
    )
    distinct: list[Article] = []
    for a in news:
        if all(h.source != a.source for h in distinct):
            distinct.append(a)
    heroes = [a for a in distinct if a.relevance_score >= 9][:max_n]
    if len(heroes) < min_n:
        heroes = distinct[:min_n]
    for a in heroes:
        a.category = "front_page"
    return articles


def write_headline(articles: list[Article], client=None) -> str:
    front = [a for a in articles if a.category == "front_page"]
    if not front:
        return "A quiet day in data & AI"
    fallback = front[0].title
    if client is None and not settings.groq_api_key:
        return fallback
    from pydantic import BaseModel

    class Headline(BaseModel):
        headline: str

    try:
        prompt = "Front-page stories:\n" + "\n".join(f"- {a.title}: {a.what_happened}" for a in front)
        result = _call_structured(
            client,
            prompt,
            Headline,
            system="Write ONE factual newspaper banner headline (max 12 words, no hype, no emojis) that summarizes today's front page.",
            retries=2,
        )
        return result.headline.strip() or fallback
    except EditorError:
        return fallback


def build_edition(items: list[RawItem], today: date | None = None) -> Edition:
    today = today or datetime.now(timezone.utc).date()
    articles, stats = edit_items(items, today)
    assign_front_page(articles)
    time.sleep(settings.llm_pause_seconds)
    headline = write_headline(articles, _gemini_client())
    return Edition(edition_date=today.isoformat(), summary_headline=headline, articles=articles, stats=stats)


# ── Offline heuristic editor (--no-llm) for testing without an API key ───────


def build_edition_heuristic(items: list[RawItem], today: date | None = None) -> Edition:
    """Deterministic stand-in: NOT an editorial judgment, just exercises the pipeline."""
    today = today or datetime.now(timezone.utc).date()
    ranked = sorted(items, key=lambda i: (-(i.signal + 10 * len(i.related_urls)), i.title))
    articles = [
        Article(
            category=it.category_hint or {"A": "research", "B": "hackathon", "C": "job"}[it.bucket],
            title=it.title,
            what_happened=_first_sentences(it.raw_snippet, 2) or "(no snippet)",
            why_it_matters="[heuristic mode — run with GEMINI_API_KEY for real editorial copy]",
            url=str(it.url),
            source=it.source,
            relevance_score=7,
            tags=[],
            deadline=it.known_deadline,
            related_urls=it.related_urls,
            published_at=it.published_at,
            bucket=it.bucket,
        )
        for it in ranked[:25]
    ]
    for a in articles[:3]:
        a.category = "front_page"
    return Edition(
        edition_date=today.isoformat(),
        summary_headline=articles[0].title if articles else "A quiet day in data & AI",
        articles=articles,
        stats={"heuristic": 1},
    )
