"""Shared data models for every pipeline stage."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

Bucket = Literal["A", "B", "C"]
Category = Literal["front_page", "research", "resource", "hackathon", "job", "webinar"]


class RawItem(BaseModel):
    """Stage 1 output: one normalized item from any source."""

    title: str
    url: HttpUrl
    source: str
    published_at: datetime | None = None  # always timezone-aware UTC when set
    raw_snippet: str = ""
    bucket: Bucket
    # Optional hard facts straight from a structured API (e.g. Kaggle deadline).
    # These are trusted over anything the LLM extracts.
    known_deadline: str | None = None
    signal: int = 0  # source-native popularity (HN points, HF upvotes) — a tie-breaker only
    max_age_hours: int | None = None  # per-source override of the bucket's time window
    related_urls: list[str] = []  # near-duplicate coverage collapsed into this item by clean.py
    category_hint: Category | None = None  # set by the fetcher when known (e.g. a job feed → "job")


# ── Stage 3: what the LLM must return (Gemini structured output schema) ──────
# The LLM never returns URLs. It points back to input items by integer id, and
# the URL is copied from the ingested item — so a URL cannot be hallucinated.


class EditedStory(BaseModel):
    source_ids: list[int] = Field(
        description="ids of ALL input items that cover this same story/announcement (clustered). At least one."
    )
    primary_id: int = Field(description="The single best source id for this story (official/primary source preferred). Must be in source_ids.")
    title: str = Field(description="Crisp, factual headline. No hype words, no clickbait, max ~90 chars.")
    what_happened: str = Field(description="Exactly 2 sentences stating the concrete facts.")
    why_it_matters: str = Field(description="Exactly 1 sentence on why it matters to an early-career data scientist / AI engineer.")
    relevance_score: int = Field(description="1-10 relevance for an early-career Data Science / AI engineer.")
    tags: list[str] = Field(description="2-5 short lowercase topic tags, e.g. 'llm', 'computer-vision', 'mlops'.")
    deadline: str | None = Field(
        default=None,
        description="YYYY-MM-DD application/submission/registration deadline ONLY if explicitly stated in the input text, else null.",
    )
    deadline_evidence: str | None = Field(
        default=None,
        description="Verbatim quote (copied exactly) from the input text that states the deadline. Required when deadline is set.",
    )
    event_start: str | None = Field(default=None, description="ISO 8601 start datetime for events/hackathons, only if explicitly stated, else null.")
    event_evidence: str | None = Field(
        default=None,
        description="Verbatim quote (copied exactly) from the input text that states the event date. Required when event_start is set.",
    )
    event_timezone: str | None = Field(default=None, description="IANA or stated timezone of the event, only if stated, else null.")
    is_remote: bool | None = Field(default=None, description="True if explicitly remote/online, False if explicitly on-site, null if unknown.")
    event_format: str | None = Field(default=None, description="Events/hackathons only: 'online', 'hybrid', or 'in_person' if stated, else null.")
    job_level: str | None = Field(
        default=None,
        description="Jobs only: 'internship', 'entry', 'mid', or 'senior' as stated or clearly implied by the title / years of experience, else null.",
    )
    company: str | None = Field(default=None, description="Jobs only: hiring company name as stated, else null.")
    location: str | None = Field(default=None, description="Jobs only: where the role can be done as stated (e.g. 'Remote (US)'), else null.")


class EditorResponse(BaseModel):
    stories: list[EditedStory]


class Article(BaseModel):
    """A verified, publishable story (Stage 3 output → Stage 4 input)."""

    category: Category
    title: str
    what_happened: str
    why_it_matters: str
    url: str
    source: str
    relevance_score: int
    tags: list[str] = []
    deadline: str | None = None
    related_urls: list[str] = []
    event_start: str | None = None
    event_timezone: str | None = None
    is_remote: bool | None = None
    event_format: str | None = None
    job_level: str | None = None
    company: str | None = None
    location: str | None = None
    published_at: datetime | None = None
    bucket: Bucket = "A"


class Edition(BaseModel):
    edition_date: str
    summary_headline: str
    articles: list[Article]
    stats: dict[str, int] = {}
