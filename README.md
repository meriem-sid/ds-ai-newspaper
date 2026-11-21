# The Data Science & AI Newspaper

A $0/month automated daily briefing: it ingests research, news, hackathons, jobs and
webinars, deduplicates them, has an LLM editor score and summarize what matters for an
early-career data scientist / AI engineer, and publishes a newspaper-style web edition.

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | `sources.yaml`, `ingest.py` (RSS, arXiv, HF Daily Papers, Hacker News), `clean.py`, `editor.py` (Gemini + Pydantic) → terminal test edition | ✅ done |
| 2 | `db.py` (Neon Postgres), Kaggle + Tavily + Remotive + We Work Remotely (hackathons, jobs, webinars), save full editions | ✅ done |
| 3 | Next.js + Tailwind reading UI (`web/`): deadlines banner, bookmarks, read state, archive search | ✅ done |
| 4 | `notify.py` (Telegram / email) + `.github/workflows/daily_edition.yml` | ✅ code done — needs your GitHub, Vercel and Telegram setup |

## Layout

```
pipeline/
  sources.yaml   # every feed/API + time windows — edit this, not code
  config.py      # .env + sources.yaml loading
  models.py      # RawItem, EditedStory (LLM schema), Article, Edition
  ingest.py      # Stage 1: fetchers; a broken source is logged + skipped
  clean.py       # Stage 2: URL normalize, seen-filter, time window, fuzzy collapse
  editor.py      # Stage 3: Gemini/Groq structured output + verification
  db.py          # Stage 4a: Postgres schema, 30-day seen-history, save_edition()
  notify.py      # Stage 4b: Telegram / email morning digest
  main.py        # orchestrator; prints the edition, saves it to Postgres
db/schema.sql    # Postgres schema (applied automatically on every run; idempotent)
tests/           # pytest unit tests for dedup + anti-hallucination rules
web/             # Next.js 16 reading interface (see below)
```

## Run it locally

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env      # then paste your GEMINI_API_KEY
.venv\Scripts\python -m pipeline.main --no-llm   # no key needed: tests ingest + clean
.venv\Scripts\python -m pipeline.main --dry-run  # full run, reads the DB but writes nothing
.venv\Scripts\python -m pipeline.main            # full run, saves today's edition to Postgres
.venv\Scripts\python -m pytest -q tests
```

With `DATABASE_URL` set, the 30-day seen-history lives in Postgres (`seen_items`), so an
item is looked at once and never re-scored or republished. `--local --remember` uses a JSON
file in `.cache/` instead. `--no-llm` editions are never saved. Each run also writes
`.cache/edition-YYYY-MM-DD.json`.

Opportunities are only published when actionable: a hackathon or webinar needs a verified
upcoming date (Kaggle's API deadline, or an LLM date backed by a verbatim quote), and
mid/senior jobs are dropped.

## Going live (one-time setup)

1. **Telegram bot** — message `@BotFather` → `/newbot` → copy the token. Send your new bot any
   message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id": …}`.
   Put both in `.env`, then check the message locally:
   `python -m pipeline.notify --preview` (prints) / `python -m pipeline.notify --test` (sends).
2. **GitHub** — create a **private** repo (Actions: 2,000 free minutes/month; a run takes ~3–8 min)
   and push this folder.
3. **Repo secrets** (Settings → Secrets and variables → Actions → Secrets):
   `GEMINI_API_KEY`, `GROQ_API_KEY`, `DATABASE_URL`, `TAVILY_API_KEY`, `KAGGLE_KEY`,
   `KAGGLE_USERNAME` (only for a legacy key), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
   optionally `RESEND_API_KEY`.
   **Variables** tab (optional): `WEB_APP_URL`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `NOTIFY_EMAIL_TO`.
4. **Vercel** — Add New → Project → import the repo → **Root Directory `web`** → env vars
   `DATABASE_URL` and `SITE_PASSWORD` → Deploy. Copy the URL into the `WEB_APP_URL` variable.
5. **First run** — Actions → *Daily edition* → *Run workflow* with **dry run** ticked; check the
   log; then run it for real. After that it runs every day at 06:00 UTC.

> GitHub pauses scheduled workflows in a repo with no activity for 60 days; any push (or
> re-enabling the workflow in the Actions tab) restarts it.

## Reading interface (`web/`)

Next.js 16 (App Router, Cache Components) + Tailwind 4, reading Postgres directly with `postgres.js`.

| Route | What it shows |
|---|---|
| `/` | Latest edition: masthead (date, edition No., prev/next, date picker), urgent-deadlines banner (anything closing within 7 days, from any edition), front page, research, hackathons (sorted by deadline, countdowns), jobs (filters: Remote / Internship / Junior-Entry), webinars (chronological) |
| `/edition/YYYY-MM-DD` | A past edition (or the nearest editions if there was none that day) |
| `/saved` | Bookmarked stories, grouped by section |
| `/archive?q=…&category=…` | Full-text search over every edition (supports `"phrases"`, `OR`, `-exclude`) |

Bookmark / mark-as-read are server actions that write to `articles`; opening a story marks it read.

```powershell
cd web
npm install
"DATABASE_URL=<same pooled Neon URL as the pipeline>" | Out-File -Encoding utf8 .env.local
npm run dev        # http://localhost:3000
```

**Deploying to Vercel (free):** import the repo, set **Root Directory = `web`**, and add
`DATABASE_URL` plus **`SITE_PASSWORD`** (enables HTTP Basic auth via `web/proxy.ts` — any
username, that password). Without `SITE_PASSWORD` anyone with the URL could toggle your bookmarks.

> The npm scripts call `node ./node_modules/next/dist/bin/next` directly: npm's Windows `.cmd`
> shims break on the `&` in this folder's name.

## LLM fallback chain

1. `GEMINI_MODEL` (default `gemini-3.8-flash`), then each of `GEMINI_FALLBACK_MODELS`
   (default `gemini-3.7-flash,gemini-3.5-flash-lite`). Each call has a hard
   `LLM_TIMEOUT_SECONDS` (120s) limit; a timeout skips straight to the next model, and the
   last model that worked is reused for the rest of the run.
2. If every Gemini model fails, the run switches to **Groq** (`GROQ_MODEL`, default
   `openai/gpt-oss-120b`, strict `json_schema` mode) for the rest of the run. Groq's free tier
   is ~8K tokens/min, so batches go out in chunks of `GROQ_BATCH_SIZE` (15) with a pause in between.
3. If every batch still fails, the run exits non-zero and publishes nothing.

## Verification guarantees

- **No hallucinated URLs:** the LLM returns integer ids that point to ingested items; the
  URL is always copied from the source data. Unknown ids → the story is dropped.
- **No hallucinated deadlines:** a deadline survives only if the LLM quotes the exact
  supporting text (fuzzy-matched against the source, ≥90) and the date is in the future.
  Deadlines from structured APIs (Kaggle) override the LLM.
- **No repeats:** normalized-URL and fuzzy-headline matching against 30 days of history,
  plus in-batch clustering (primary sources beat aggregators like HN).

## API keys

| Phase | Variable | Where | Cost |
|---|---|---|---|
| 1 | `GEMINI_API_KEY` | aistudio.google.com/apikey | free tier |
| 1 | `GEMINI_MODEL` | any Flash / Flash-Lite id your key lists | — |
| 1 | `GROQ_API_KEY` (recommended) | console.groq.com/keys — cross-provider fallback | free tier |
| 2 | `DATABASE_URL` | Neon project → connection string (pooled) | free tier |
| 2 | `TAVILY_API_KEY` | tavily.com (1,000 credits/month) | free tier |
| 2 | `KAGGLE_USERNAME`, `KAGGLE_KEY` | kaggle.com → Settings → API → Create token | free |
| 4 | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | @BotFather, then message your bot | free |

arXiv, Hugging Face Daily Papers, Hacker News and the RSS feeds need no keys.
