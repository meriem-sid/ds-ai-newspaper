from datetime import date, datetime, timedelta, timezone

from pipeline.clean import clean, collapse_duplicates, normalize_url
from pipeline.editor import assign_front_page, verify_story
from pipeline.models import EditedStory, RawItem

NOW = datetime(2026, 11, 21, 6, 0, tzinfo=timezone.utc)
TODAY = NOW.date()


def item(title, url, source="Blog", hours_ago=2, bucket="A", snippet="", **kw):
    return RawItem(title=title, url=url, source=source, bucket=bucket, raw_snippet=snippet,
                   published_at=NOW - timedelta(hours=hours_ago) if hours_ago is not None else None, **kw)


def story(**kw):
    base = dict(source_ids=[0], primary_id=0, title="T", what_happened="A. B. C.", why_it_matters="X. Y.",
                relevance_score=8, tags=["LLM Ops"])
    return EditedStory(**{**base, **kw})


# ── clean.py ─────────────────────────────────────────────────────────────────

def test_normalize_url_strips_tracking_and_www():
    assert normalize_url("http://www.Example.com/post/?utm_source=x&id=3#frag") == "https://example.com/post?id=3"


def test_collapse_prefers_primary_source_over_hn():
    items = [
        item("Show HN: OpenAI releases GPT-6 open weights model", "https://news.ycombinator.com/item?id=1", source="Hacker News", signal=300),
        item("OpenAI releases GPT-6 open-weights model", "https://openai.com/index/gpt-6", source="OpenAI"),
    ]
    out = collapse_duplicates(items)
    assert len(out) == 1
    assert out[0].source == "OpenAI"
    assert out[0].related_urls == ["https://news.ycombinator.com/item?id=1"]
    assert out[0].signal == 300


def test_clean_drops_seen_old_and_undated_news():
    items = [
        item("Fresh story about diffusion models", "https://a.com/1"),
        item("Old story about transformers", "https://a.com/2", hours_ago=100),
        item("Undated news story here", "https://a.com/3", hours_ago=None),
        item("Already seen story", "https://a.com/4"),
        item("Undated hackathon is kept", "https://b.com/5", hours_ago=None, bucket="B"),
    ]
    out, stats = clean(items, seen_urls={"https://a.com/4"}, seen_titles=[], now=NOW)
    assert {str(i.url) for i in out} == {"https://a.com/1", "https://b.com/5"}
    assert stats["raw"] == 5


def test_clean_drops_headline_seen_on_previous_day():
    items = [item("Meta releases Llama 5 with 1M context", "https://new-url.com/x")]
    out, _ = clean(items, set(), ["meta releases llama 5 with 1m context"], now=NOW)
    assert out == []


# ── editor.py verification ───────────────────────────────────────────────────

def test_unknown_primary_id_is_dropped():
    batch = {0: item("Real", "https://a.com/1")}
    assert verify_story(story(primary_id=7, source_ids=[7]), batch, TODAY) is None


def test_url_comes_from_input_and_copy_is_trimmed():
    batch = {0: item("Real", "https://a.com/1"), 1: item("Dup", "https://b.com/2")}
    art = verify_story(story(source_ids=[0, 1, 99]), batch, TODAY)
    assert art.url == "https://a.com/1"
    assert art.related_urls == ["https://b.com/2"]
    assert art.what_happened == "A. B."
    assert art.why_it_matters == "X."
    assert art.tags == ["llm-ops"]


def test_deadline_requires_matching_evidence():
    batch = {0: item("Hackathon", "https://h.com", bucket="B", snippet="Submissions close on December 5, 2026 at noon.")}
    good = verify_story(story(deadline="2026-12-05", deadline_evidence="Submissions close on December 5, 2026"), batch, TODAY)
    assert good.deadline == "2026-12-05"
    # A hackathon whose only date is unverified (invented or past) is not actionable → dropped.
    invented = verify_story(story(deadline="2026-12-05", deadline_evidence="Deadline is Dec 5"), batch, TODAY)
    assert invented is None
    past = verify_story(story(deadline="2026-01-05", deadline_evidence="Submissions close on December 5, 2026"), batch, TODAY)
    assert past is None
    # The same unverified deadline on a news story just gets cleared.
    news = {0: item("News", "https://n.com", snippet="Submissions close on December 5, 2026.")}
    assert verify_story(story(deadline="2026-12-05", deadline_evidence="Deadline is Dec 5"), news, TODAY).deadline is None


def test_webinar_needs_evidenced_future_start_and_job_levels_normalised():
    web = {0: item("LLM workshop", "https://lu.ma/x", bucket="C", category_hint="webinar",
                   snippet="Join us live on Dec 3, 2026 at 5pm UTC for a hands-on RAG workshop.")}
    ok = verify_story(story(event_start="2026-12-03T17:00:00Z", event_evidence="Dec 3, 2026 at 5pm UTC", event_format="Online"), web, TODAY)
    assert ok.category == "webinar" and ok.event_start.startswith("2026-12-03") and ok.event_format == "online"
    assert verify_story(story(event_start="2026-12-03T17:00:00Z", event_evidence="December 3rd"), web, TODAY) is None
    jobs = {0: item("ML Engineer", "https://jobs.lever.co/x", bucket="C", category_hint="job")}
    # Every level is kept now; wording variants map onto internship / entry / mid / senior.
    for given, stored in [("Senior", "senior"), ("Staff", "senior"), ("lead", "senior"), ("Mid-level", "mid"),
                          ("junior", "entry"), ("New grad", "entry"), ("internship", "internship"), ("whatever", None)]:
        assert verify_story(story(job_level=given), jobs, TODAY).job_level == stored, given


def test_job_company_and_location_are_kept_and_cleaned():
    jobs = {0: item("ML Engineer", "https://jobs.lever.co/x", bucket="C", category_hint="job")}
    art = verify_story(story(job_level="mid", company=" Hugging Face ", location="Remote (EMEA)"), jobs, TODAY)
    assert (art.company, art.location) == ("Hugging Face", "Remote (EMEA)")
    art = verify_story(story(job_level="mid", company="null", location="Not stated"), jobs, TODAY)
    assert (art.company, art.location) == (None, None)
    # Non-job stories never carry job fields.
    news = {0: item("News", "https://n.com")}
    assert verify_story(story(company="Acme", job_level="senior"), news, TODAY).company is None


def test_known_deadline_from_api_wins():
    batch = {0: item("Kaggle comp", "https://kaggle.com/c/x", bucket="B", known_deadline="2027-01-31")}
    art = verify_story(story(deadline="2026-12-01", deadline_evidence="nope"), batch, TODAY)
    assert art.deadline == "2027-01-31"
    assert art.category == "hackathon"


def test_front_page_gets_three_to_five():
    batch = {i: item(f"Story {i}", f"https://a.com/{i}", source=f"Source {i}") for i in range(8)}
    arts = [verify_story(story(source_ids=[i], primary_id=i, relevance_score=s), batch, TODAY)
            for i, s in enumerate([10, 9, 9, 9, 9, 9, 8, 7])]
    assign_front_page(arts)
    assert sum(a.category == "front_page" for a in arts) == 5
    arts2 = [verify_story(story(source_ids=[i], primary_id=i, relevance_score=s), batch, TODAY)
             for i, s in enumerate([8, 8, 7, 7])]
    assign_front_page(arts2)
    assert sum(a.category == "front_page" for a in arts2) == 3


# ── LLM provider fallback ────────────────────────────────────────────────────

from pipeline import editor  # noqa: E402
from pipeline.models import EditorResponse  # noqa: E402


def test_strict_schema_meets_groq_rules():
    schema = editor.strict_json_schema(EditorResponse)

    def walk(node):
        if isinstance(node, dict):
            assert "default" not in node
            if node.get("type") == "object" and "properties" in node:
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(schema)
    story_props = schema["$defs"]["EditedStory"]["properties"]
    assert set(story_props) == set(editor.EditedStory.model_fields)  # incl. the field named "title"


def test_groq_takes_over_in_chunks_when_gemini_fails(monkeypatch):
    calls = []

    def gemini_down(*a, **k):
        raise editor.EditorError("503 overloaded")

    def fake_groq(prompt, schema, system, retries=3):
        calls.append(prompt)
        return EditorResponse(stories=[])

    monkeypatch.setattr(editor, "_call_gemini", gemini_down)
    monkeypatch.setattr(editor, "_call_groq", fake_groq)
    monkeypatch.setattr(editor.settings, "groq_api_key", "x")
    monkeypatch.setattr(editor.settings, "groq_batch_size", 15)
    monkeypatch.setattr(editor.settings, "groq_pause_seconds", 0)
    monkeypatch.setattr(editor, "_gemini_down", False)
    batch = {i: item(f"Story {i}", f"https://a.com/{i}") for i in range(40)}
    assert editor._edit_batch(object(), batch) == []
    assert len(calls) == 3            # 15 + 15 + 10
    assert editor._gemini_down is True  # later batches skip Gemini entirely


def test_gemini_failure_without_groq_raises(monkeypatch):
    monkeypatch.setattr(editor, "_call_gemini", lambda *a, **k: (_ for _ in ()).throw(editor.EditorError("503")))
    monkeypatch.setattr(editor.settings, "groq_api_key", None)
    monkeypatch.setattr(editor, "_gemini_down", False)
    import pytest
    with pytest.raises(editor.EditorError):
        editor._edit_batch(object(), {0: item("S", "https://a.com/0")})


# ── Editorial balance ────────────────────────────────────────────────────────

def test_news_and_papers_are_batched_separately_news_first():
    items = [item("Paper one", "https://arxiv.org/abs/1", source="arXiv"),
             item("News one", "https://openai.com/n", source="OpenAI"),
             item("Paper two", "https://huggingface.co/papers/2", source="HF Daily Papers"),
             item("Hack", "https://h.com", bucket="B")]
    groups = editor.editorial_groups(items)
    assert [(b, [i.source for i in g]) for b, g in groups] == [
        ("news", ["OpenAI"]), ("papers", ["arXiv", "HF Daily Papers"]), ("hackathon", ["Blog"])]


def test_cap_papers_keeps_best_and_never_touches_news():
    batch = {i: item(f"S{i}", f"https://a.com/{i}", source="HF Daily Papers" if i % 2 else "arXiv") for i in range(12)}
    papers = [verify_story(story(source_ids=[i], primary_id=i, relevance_score=7 + (i < 3)), batch, TODAY) for i in range(12)]
    news_batch = {0: item("News", "https://n.com", source="OpenAI")}
    news = verify_story(story(relevance_score=7), news_batch, TODAY)
    kept, dropped = editor.cap_papers(papers + [news])
    assert dropped == 4 and news in kept
    kept_papers = [a for a in kept if a.source != "OpenAI"]
    assert len(kept_papers) == 8
    assert sum(a.relevance_score == 8 for a in kept_papers) == 3       # all top scorers survive
    assert all(a.source == "HF Daily Papers" for a in kept_papers if a.relevance_score == 7)  # HF wins ties


def test_onsite_jobs_and_in_person_events_are_dropped():
    jobs = {0: item("Intern", "https://jobs.lever.co/x", bucket="C", category_hint="job")}
    assert verify_story(story(job_level="internship", is_remote=False), jobs, TODAY) is None
    assert verify_story(story(job_level="internship", is_remote=None), jobs, TODAY) is not None  # unknown passes
    hack = {0: item("Hack", "https://h.com", bucket="B", known_deadline="2027-01-01")}
    assert verify_story(story(event_format="in-person"), hack, TODAY) is None
    assert verify_story(story(event_format="hybrid", is_remote=False), hack, TODAY) is not None


# ── notify.py ────────────────────────────────────────────────────────────────

from pipeline import notify  # noqa: E402
from pipeline.models import Article, Edition  # noqa: E402


def _art(cat, title, score=8, deadline=None, url="https://a.com/x"):
    return Article(category=cat, title=title, what_happened="W.", why_it_matters="Because <reasons> & more.",
                   url=url, source="S", relevance_score=score, deadline=deadline)


def test_digest_escapes_html_and_lists_top3_and_deadlines():
    today = datetime.now(timezone.utc).date()
    ed = Edition(edition_date=today.isoformat(), summary_headline="Big <news> & stuff", articles=[
        _art("front_page", f"Story {i} <b>", score=10 - i, url=f"https://a.com/{i}?x=1&y=\"2\"") for i in range(4)
    ] + [_art("job", "Job"), _art("webinar", "Event")])
    dl = [_art("hackathon", "Hack & Co", deadline=(today + timedelta(days=1)).isoformat())]
    text = notify.build_digest(ed, dl, "https://news.example.app", 7)
    assert "No. 7" in text and "Big &lt;news&gt; &amp; stuff" in text
    assert "Story 0 &lt;b&gt;" in text and "Story 3" not in text           # top 3 only
    assert 'href="https://a.com/0?x=1&amp;y=&quot;2&quot;"' in text          # attribute-escaped
    assert "Hack &amp; Co</a> — <b>tomorrow</b>" in text
    assert "1 job · 1 event" in text and "Read the full edition" in text


def test_send_telegram_skips_without_credentials(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    assert notify.send_telegram("hi") is False


def test_strip_inline_latex_keeps_prices():
    from pipeline.editor import strip_inline_latex
    assert strip_inline_latex("boosts $R^2$ and $k$ neighbours") == "boosts R^2 and k neighbours"
    money = "a $67,500 total prize pool and a $25,000 top prize"
    assert strip_inline_latex(money) == money


def test_jobs_with_similar_titles_are_not_merged():
    from pipeline.editor import _dedupe_articles
    jobs = [
        item("Spring Health: Senior Data Engineer", "https://a.com/j1", bucket="C", source="We Work Remotely"),
        item("EnergyHub: Senior Data Engineer", "https://b.com/j2", bucket="C", source="We Work Remotely"),
    ]
    assert len(collapse_duplicates(jobs)) == 2
    out, _ = clean(jobs, set(), ["spring health senior data engineer old posting"], now=NOW)
    assert len(out) == 2  # cross-day headline matching is for news only
    batch = {0: jobs[0], 1: jobs[1]}
    arts = [verify_story(story(source_ids=[i], primary_id=i, title="Senior Data Engineer", company=c), batch, TODAY)
            for i, c in enumerate(["Spring Health", "EnergyHub"])]
    assert len(_dedupe_articles(arts)) == 2
    # ...but the same role at the same company twice is still one item.
    same = [verify_story(story(source_ids=[i], primary_id=i, title="Senior Data Engineer", company="EnergyHub"), batch, TODAY) for i in (0, 1)]
    same[1].url = same[0].url + "?ref=x"
    assert len(_dedupe_articles(same)) == 1


def test_news_still_collapses_reworded_headlines():
    news = [item("OpenAI releases GPT-6 open-weights model", "https://openai.com/x", source="OpenAI"),
            item("Show HN: OpenAI releases GPT-6 open weights model today", "https://news.ycombinator.com/item?id=9", source="Hacker News")]
    assert len(collapse_duplicates(news)) == 1


def test_groq_chunks_respect_token_budget(monkeypatch):
    monkeypatch.setattr(editor.settings, "groq_max_input_tokens", 1500)
    monkeypatch.setattr(editor.settings, "groq_batch_size", 15)
    batch = {i: item(f"Job {i}", f"https://j.com/{i}", bucket="C", snippet="x " * 400) for i in range(10)}  # ~230 tokens each
    chunks = editor.groq_chunks(batch, "system prompt")
    assert sum(len(c) for c in chunks) == 10 and len(chunks) > 1
    assert all(editor.estimate_tokens(editor._batch_prompt(c)) <= 1500 for c in chunks)
    # a single oversize item still gets its own chunk rather than being dropped
    huge = {0: item("Huge", "https://j.com/h", bucket="C", snippet="y " * 5000)}
    assert editor.groq_chunks(huge, "s") == [huge]


def test_groq_oversize_detection():
    import httpx as _h
    mk = lambda code, text: _h.Response(code, text=text)
    assert editor._groq_oversize(mk(413, "too big"))
    assert editor._groq_oversize(mk(429, "on tokens per minute (TPM): Limit 8000, Requested 9123, please reduce"))
    assert not editor._groq_oversize(mk(429, "on tokens per minute (TPM): Limit 8000, Used 6000, Requested 3000."))
    assert not editor._groq_oversize(mk(500, "server error"))


# ── Source diversity & resources ─────────────────────────────────────────────

def test_front_page_takes_one_story_per_source():
    batch = {i: item(f"Story {i}", f"https://a.com/{i}", source="NVIDIA Tech Blog" if i < 3 else f"S{i}") for i in range(5)}
    arts = [verify_story(story(source_ids=[i], primary_id=i, relevance_score=s), batch, TODAY)
            for i, s in enumerate([10, 10, 10, 8, 8])]
    assign_front_page(arts)
    front = [a for a in arts if a.category == "front_page"]
    assert len(front) == 3 and len({a.source for a in front}) == 3


def test_cap_per_source_keeps_best_two_and_exempts_jobs_papers():
    batch = {i: item(f"N{i}", f"https://n.com/{i}", source="NVIDIA Tech Blog") for i in range(4)}
    news = [verify_story(story(source_ids=[i], primary_id=i, relevance_score=7 + (i == 3)), batch, TODAY) for i in range(4)]
    jb = {i: item(f"J{i}", f"https://j.com/{i}", bucket="C", category_hint="job", source="Greenhouse") for i in range(3)}
    jobs = [verify_story(story(source_ids=[i], primary_id=i, company=f"C{i}"), jb, TODAY) for i in range(3)]
    pb = {i: item(f"P{i}", f"https://arxiv.org/abs/{i}", source="arXiv") for i in range(3)}
    papers = [verify_story(story(source_ids=[i], primary_id=i), pb, TODAY) for i in range(3)]
    kept, dropped = editor.cap_per_source(news + jobs + papers)
    assert dropped == 2
    kept_news = [a for a in kept if a.source == "NVIDIA Tech Blog"]
    assert len(kept_news) == 2 and max(a.relevance_score for a in kept_news) == 8   # the best one survives
    assert sum(a.category == "job" for a in kept) == 3 and sum(a.source == "arXiv" for a in kept) == 3


def test_resources_get_their_own_batch_and_category():
    items = [item("NVIDIA ships X", "https://nvidia.com/x", source="NVIDIA Tech Blog"),
             item("owner/repo", "https://github.com/owner/repo", source="GitHub", category_hint="resource"),
             item("Paper", "https://arxiv.org/abs/1", source="arXiv")]
    groups = dict(editor.editorial_groups(items))
    assert [i.source for i in groups["resources"]] == ["GitHub"]
    assert [i.source for i in groups["news"]] == ["NVIDIA Tech Blog"]
    art = verify_story(story(source_ids=[0], primary_id=0), {0: items[1]}, TODAY)
    assert art.category == "resource"


def test_readme_intro_strips_markup():
    from pipeline.ingest import readme_intro
    md = "---\nlicense: mit\ntags: [x]\n---\n# Model\n![badge](https://img)\n<p align=center>hi</p>\nA **7B** [vision](https://x) model.\n"
    assert readme_intro(md) == "Model hi A 7B vision model."


def test_resources_only_reach_front_page_when_exceptional():
    batch = {0: item("owner/tool", "https://github.com/o/t", source="GitHub", category_hint="resource"),
             1: item("model", "https://huggingface.co/m", source="HF Models", category_hint="resource"),
             2: item("News A", "https://a.com/1", source="A"),
             3: item("News B", "https://b.com/1", source="B")}
    arts = [verify_story(story(source_ids=[i], primary_id=i, relevance_score=s), batch, TODAY) for i, s in enumerate([8, 9, 7, 7])]
    assign_front_page(arts)
    cats = {a.source: a.category for a in arts}
    assert cats["GitHub"] == "resource"          # 8: stays in Tools & Resources
    assert cats["HF Models"] == "front_page"     # 9: exceptional enough to lead
    assert cats["A"] == cats["B"] == "front_page"
