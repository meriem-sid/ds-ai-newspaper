"""Environment + sources.yaml loading. Import `settings` and `SOURCES` from here."""
from __future__ import annotations

import logging
import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

SOURCES: dict = yaml.safe_load((Path(__file__).parent / "sources.yaml").read_text(encoding="utf-8"))


class Settings:
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
    # Model ids change often — override in .env without touching code.
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    # Tried in order when the primary model is overloaded (503) or out of quota.
    gemini_fallbacks: list[str] = [
        m.strip() for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.7-flash,gemini-3.5-flash-lite").split(",") if m.strip()
    ]

    llm_timeout_seconds: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "120"))

    # Groq — cross-provider fallback when every Gemini model is down (free key: console.groq.com).
    groq_api_key: str | None = os.getenv("GROQ_API_KEY") or None
    groq_model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")  # supports strict json_schema
    groq_batch_size: int = int(os.getenv("GROQ_BATCH_SIZE", "15"))     # free tier ≈ 8K tokens/min
    groq_pause_seconds: float = float(os.getenv("GROQ_PAUSE_SECONDS", "20"))

    @property
    def model_chain(self) -> list[str]:
        return list(dict.fromkeys([self.gemini_model, *self.gemini_fallbacks]))

    min_relevance: int = int(os.getenv("MIN_RELEVANCE", "7"))
    llm_batch_size: int = int(os.getenv("LLM_BATCH_SIZE", "40"))
    llm_pause_seconds: float = float(os.getenv("LLM_PAUSE_SECONDS", "4"))  # stay under free-tier RPM
    http_timeout: float = float(os.getenv("HTTP_TIMEOUT", "20"))
    user_agent: str = os.getenv("USER_AGENT", "ds-ai-newspaper/0.1 (personal news digest)")
    # Phase 1 stand-in for the Postgres "seen in last 30 days" table.
    seen_cache_path: Path = ROOT / ".cache" / "seen_items.json"


settings = Settings()

logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per request is noise

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
