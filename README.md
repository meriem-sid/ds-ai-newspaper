# The Data Science & AI Newspaper

An automated daily briefing for early-career data scientists and AI engineers, built to run entirely on free tiers.

Every morning it collects new research papers, model and tool releases, industry news, hackathons and competitions, remote junior and internship roles, and online workshops. It drops duplicates and anything already covered in the last 30 days, then uses an LLM editor (Gemini, with Groq as a fallback) to keep only what is worth reading and write a short, hype-free summary of each story. Every link comes straight from the original source. Deadlines and event dates are only shown when they can be verified against the source text.

The result is published as a newspaper-style web edition with a front page, an urgent-deadlines banner, sections for research, hackathons, jobs and events, bookmarks, read tracking, and a searchable archive. A short digest is also sent to Telegram each morning.

**Stack:** Python pipeline · Neon Postgres · Next.js + Tailwind on Vercel · GitHub Actions (daily schedule) · Telegram bot

## Installation

### 1. Get the free API keys

| Key | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) |
| `DATABASE_URL` | [neon.tech](https://neon.tech) → new project → *Connect* → pooled connection string |
| `TAVILY_API_KEY` | [app.tavily.com](https://app.tavily.com) |
| `KAGGLE_KEY` | kaggle.com → *Settings* → *API* → *Create New Token* |
| `RESEND_API_KEY` (email briefing) | [resend.com/api-keys](https://resend.com/api-keys) — also verify a domain you own under *Domains* |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Message `@BotFather` → `/newbot` for the token. Send your bot a message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat": {"id": …}` |

### 2. Set up the pipeline (Python 3.12+)

```bash
git clone https://github.com/meriem-sid/ds-ai-newspaper.git
cd ds-ai-newspaper
python -m venv .venv
```

Activate the virtual environment, install the dependencies and create your `.env`:

| macOS / Linux | Windows (PowerShell) |
|---|---|
| `source .venv/bin/activate` | `.venv\Scripts\Activate.ps1` |
| `pip install -r requirements.txt` | `pip install -r requirements.txt` |
| `cp .env.example .env` | `copy .env.example .env` |

Fill in the keys in `.env`. Then, with the virtual environment still active, run the tests and build a first edition (the database tables are created automatically):

```bash
python -m pytest -q tests
python -m pipeline.main --dry-run
python -m pipeline.main
```

`--dry-run` prints the edition without saving or sending anything.

To change the sources, search queries, keyword filters or time windows, edit [`pipeline/sources.yaml`](pipeline/sources.yaml). No code changes needed.

### 3. Set up the web app (Node.js 20+)

```bash
cd web
npm install
```

Create `web/.env.local` containing one line, `DATABASE_URL=<your Neon connection string>`, then start the app:

```bash
npm run dev
```

Open http://localhost:3000.

### 4. Deploy

**Web app on Vercel:** *Add New → Project* → import the repository → set **Root Directory** to `web` → add the environment variables `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_SITE_URL` (your site's URL, used in confirmation links) and `RATE_LIMIT_SALT` (any long random string; it anonymises visitors on the games leaderboard) → *Deploy*.

**Daily run on GitHub Actions:** in the repository, go to *Settings → Secrets and variables → Actions*.
- On the **Secrets** tab, add: `GEMINI_API_KEY`, `GROQ_API_KEY`, `DATABASE_URL`, `TAVILY_API_KEY`, `KAGGLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`.
- On the **Variables** tab, add `WEB_APP_URL` with your site's URL and `EMAIL_FROM` (an address on a domain verified in Resend).

Then open *Actions → Daily edition → Run workflow* and tick **Dry run** to check the setup. After that, the workflow runs automatically every day at 05:37 UTC.

## License

[MIT](LICENSE)
