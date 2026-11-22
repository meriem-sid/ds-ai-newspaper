-- Data Science & AI Newspaper — PostgreSQL schema (Neon / Supabase)
-- Safe to re-run: every statement is idempotent.

CREATE TABLE IF NOT EXISTS editions (
    id               SERIAL PRIMARY KEY,
    edition_date     DATE UNIQUE NOT NULL,
    summary_headline TEXT,
    item_counts      JSONB DEFAULT '{}'::jsonb,  -- per-stage stats for the run
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS articles (
    id              SERIAL PRIMARY KEY,
    edition_id      INT REFERENCES editions(id) ON DELETE CASCADE,
    category        VARCHAR(50) NOT NULL,   -- 'front_page', 'research', 'hackathon', 'job', 'webinar'
    title           TEXT NOT NULL,
    what_happened   TEXT NOT NULL,
    why_it_matters  TEXT,
    url             TEXT UNIQUE NOT NULL,
    source          VARCHAR(100),
    relevance_score INT,
    deadline        DATE,                   -- NULL for regular news
    tags            TEXT[],
    is_bookmarked   BOOLEAN DEFAULT FALSE,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW(),

    -- Extensions to the original spec (all nullable, used by the web UI) --
    related_urls    TEXT[],                 -- other coverage clustered into this story
    event_start     TIMESTAMPTZ,            -- webinars / hackathon start
    event_timezone  VARCHAR(64),
    is_remote       BOOLEAN,
    event_format    VARCHAR(20),            -- 'online' | 'hybrid' | 'in_person' | 'unknown'
    job_level       VARCHAR(20),            -- 'internship' | 'entry' | 'mid' | 'senior' | NULL
    published_at    TIMESTAMPTZ,
    search_vector   tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(what_happened, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(why_it_matters, '')), 'C')
    ) STORED
);

-- Added after launch (idempotent for existing databases).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS company  TEXT;   -- jobs: hiring company
ALTER TABLE articles ADD COLUMN IF NOT EXISTS location TEXT;   -- jobs: "Remote (US)", "Berlin or remote", ...
UPDATE articles SET job_level = 'entry' WHERE job_level = 'junior';

CREATE INDEX IF NOT EXISTS idx_articles_edition   ON articles (edition_id);
CREATE INDEX IF NOT EXISTS idx_articles_deadline  ON articles (deadline) WHERE deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_bookmark  ON articles (is_bookmarked) WHERE is_bookmarked;
CREATE INDEX IF NOT EXISTS idx_articles_search    ON articles USING GIN (search_vector);

-- Every URL / headline the pipeline has *looked at* (kept or rejected), so a
-- rejected item is not re-scored by the LLM tomorrow and the same story never
-- reappears across days. Pruned to 30 days by the pipeline.
CREATE TABLE IF NOT EXISTS seen_items (
    url        TEXT PRIMARY KEY,
    title_norm TEXT NOT NULL,
    bucket     VARCHAR(10),
    kept       BOOLEAN DEFAULT FALSE,
    seen_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seen_items_seen_at ON seen_items (seen_at);

-- Daily puzzle leaderboard (web/app/api/games). One entry per visitor per puzzle
-- per day: visitors are identified by a salted SHA-256 of their IP, never the IP itself.
CREATE TABLE IF NOT EXISTS game_scores (
    id          SERIAL PRIMARY KEY,
    game        VARCHAR(20) NOT NULL,          -- 'sudoku' | 'binary'
    puzzle_date DATE NOT NULL,
    nickname    VARCHAR(20) NOT NULL,
    seconds     INT NOT NULL CHECK (seconds > 0),
    ip_hash     CHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (game, puzzle_date, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_game_scores_board ON game_scores (game, puzzle_date, seconds);

-- Email briefing subscribers (double opt-in). Emails are stored lowercased.
-- verify_token: one-time link in the confirmation email; unsubscribe_token: stable
-- per subscriber, used in every briefing's unsubscribe link and List-Unsubscribe header.
CREATE TABLE IF NOT EXISTS subscribers (
    id                SERIAL PRIMARY KEY,
    email             VARCHAR(254) UNIQUE NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'active', 'unsubscribed')),
    verify_token      CHAR(64),
    unsubscribe_token CHAR(64) UNIQUE NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    confirm_sent_at   TIMESTAMPTZ,              -- last confirmation email (throttles re-sends)
    confirmed_at      TIMESTAMPTZ,
    unsubscribed_at   TIMESTAMPTZ,
    last_sent_on      DATE,                     -- last briefing date: never two briefings for one edition
    signup_ip_hash    CHAR(64)                  -- salted hash, for sign-up rate limiting only
);

CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscribers_signup ON subscribers (signup_ip_hash, confirm_sent_at);
