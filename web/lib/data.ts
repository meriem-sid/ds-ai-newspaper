import "server-only";
import { connection } from "next/server";
import { sql } from "./db";

export type Category = "front_page" | "research" | "resource" | "hackathon" | "job" | "webinar";

export type Article = {
  id: number;
  category: Category;
  title: string;
  what_happened: string;
  why_it_matters: string | null;
  url: string;
  source: string | null;
  relevance_score: number | null;
  deadline: string | null; // YYYY-MM-DD
  tags: string[];
  related_urls: string[];
  event_start: string | null; // ISO, UTC
  event_timezone: string | null;
  is_remote: boolean | null;
  event_format: string | null;
  job_level: string | null; // 'internship' | 'entry' | 'mid' | 'senior'
  company: string | null;
  location: string | null;
  posted_on: string | null; // YYYY-MM-DD, when the source published it
  edition_date: string; // YYYY-MM-DD
};

export type Edition = {
  id: number;
  edition_date: string;
  summary_headline: string | null;
  number: number;
};

export type EditionNav = { dates: string[]; first: string | null; last: string | null };

// Dates/timestamps are formatted in SQL so they never shift with the server's timezone.
const ARTICLE_COLUMNS = `
  a.id, a.category, a.title, a.what_happened, a.why_it_matters, a.url, a.source,
  a.relevance_score, to_char(a.deadline, 'YYYY-MM-DD') AS deadline,
  coalesce(a.tags, '{}') AS tags,
  coalesce(a.related_urls, '{}') AS related_urls,
  to_char(a.event_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS event_start,
  a.event_timezone, a.is_remote, a.event_format, a.job_level, a.company, a.location,
  to_char(a.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS posted_on,
  to_char(e.edition_date, 'YYYY-MM-DD') AS edition_date`;

/** Today's date in UTC (the pipeline runs on a UTC cron). */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getEditionNav(): Promise<EditionNav> {
  await connection();
  const rows = await sql()<{ d: string }[]>`
    SELECT to_char(edition_date, 'YYYY-MM-DD') AS d FROM editions ORDER BY edition_date DESC`;
  const dates = rows.map((r) => r.d);
  return { dates, first: dates.at(-1) ?? null, last: dates[0] ?? null };
}

/** The edition for `date`, or the latest one when `date` is omitted. */
export async function getEdition(date?: string): Promise<{ edition: Edition; articles: Article[] } | null> {
  await connection();
  const db = sql();
  const [edition] = await db<Edition[]>`
    SELECT id, to_char(edition_date, 'YYYY-MM-DD') AS edition_date, summary_headline,
           (SELECT COUNT(*) FROM editions e2 WHERE e2.edition_date <= e.edition_date)::int AS number
    FROM editions e
    ${date ? db`WHERE edition_date = ${date}` : db``}
    ORDER BY edition_date DESC LIMIT 1`;
  if (!edition) return null;
  const articles = await db.unsafe<Article[]>(
    `SELECT ${ARTICLE_COLUMNS} FROM articles a JOIN editions e ON e.id = a.edition_id
     WHERE a.edition_id = $1 ORDER BY a.relevance_score DESC NULLS LAST, a.id`,
    [edition.id],
  );
  return { edition, articles };
}

/** Anything (from any edition) whose deadline falls within the next `days` days. */
export async function getUrgentDeadlines(days = 7): Promise<Article[]> {
  await connection();
  const today = todayUTC();
  return sql().unsafe<Article[]>(
    `SELECT ${ARTICLE_COLUMNS} FROM articles a JOIN editions e ON e.id = a.edition_id
     WHERE a.deadline BETWEEN $1::date AND $1::date + $2::int
     ORDER BY a.deadline, a.relevance_score DESC`,
    [today, days],
  );
}

/** Caps for today's running boards (keep the paper scannable on busy weeks). */
export const BOARD_LIMITS = { hackathon: 9, job: 12, webinar: 8 } as const;
export const JOB_BOARD_DAYS = 14;

/**
 * Today's page shows opportunities while they're still valid, not only the day they were
 * found: hackathons until their deadline, events until they happen, jobs for two weeks.
 * (Past editions keep showing just their own stories.)
 */
export async function getLiveBoards(): Promise<{ hackathons: Article[]; jobs: Article[]; webinars: Article[] }> {
  await connection();
  const db = sql();
  const today = todayUTC();
  const q = (where: string, order: string, limit: number, params: unknown[]) =>
    db.unsafe<Article[]>(
      `SELECT ${ARTICLE_COLUMNS} FROM articles a JOIN editions e ON e.id = a.edition_id WHERE ${where} ORDER BY ${order} LIMIT ${limit}`,
      params as never[],
    );
  const [hackathons, jobs, webinars] = await Promise.all([
    q(
      `a.category = 'hackathon' AND COALESCE(a.deadline, (a.event_start AT TIME ZONE 'UTC')::date) >= $1::date`,
      `COALESCE(a.deadline, (a.event_start AT TIME ZONE 'UTC')::date), a.relevance_score DESC`,
      BOARD_LIMITS.hackathon,
      [today],
    ),
    q(
      `a.category = 'job' AND e.edition_date >= $1::date - ${JOB_BOARD_DAYS}`,
      `e.edition_date DESC, a.relevance_score DESC`,
      BOARD_LIMITS.job,
      [today],
    ),
    q(
      `a.category = 'webinar' AND COALESCE((a.event_start AT TIME ZONE 'UTC')::date, a.deadline) >= $1::date`,
      `COALESCE(a.event_start, a.deadline::timestamptz)`,
      BOARD_LIMITS.webinar,
      [today],
    ),
  ]);
  return { hackathons, jobs, webinars };
}

/** This week's best research from earlier editions, to top up a thin day (excluding ids already on the page). */
export async function getRecentResearch(beforeDate: string, limit: number, excludeIds: number[]): Promise<Article[]> {
  if (limit <= 0) return [];
  await connection();
  return sql().unsafe<Article[]>(
    `SELECT ${ARTICLE_COLUMNS} FROM articles a JOIN editions e ON e.id = a.edition_id
     WHERE a.category IN ('research', 'front_page') AND e.edition_date < $1::date
       AND e.edition_date >= $1::date - 7 AND NOT (a.id = ANY($2::int[]))
     ORDER BY a.relevance_score DESC, e.edition_date DESC LIMIT ${Number(limit)}`,
    [beforeDate, excludeIds],
  );
}

/** Articles for a visitor's saved list (ids come from their browser, so cap and sanitise them). */
export async function getArticlesByIds(ids: number[]): Promise<Article[]> {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 300);
  if (clean.length === 0) return [];
  await connection();
  return sql().unsafe<Article[]>(
    `SELECT ${ARTICLE_COLUMNS} FROM articles a JOIN editions e ON e.id = a.edition_id
     WHERE a.id = ANY($1::int[]) ORDER BY e.edition_date DESC, a.relevance_score DESC`,
    [clean],
  );
}

export const ARCHIVE_CATEGORIES: Category[] = ["front_page", "research", "resource", "hackathon", "job", "webinar"];

/** Full-text search over every edition (title > what happened > why it matters). */
export async function searchArchive(q: string, category?: string): Promise<Article[]> {
  await connection();
  const cat: string | null = category && ARCHIVE_CATEGORIES.includes(category as Category) ? category : null;
  const query = q.trim();
  if (!query) {
    return sql().unsafe<Article[]>(
      `SELECT ${ARTICLE_COLUMNS} FROM articles a JOIN editions e ON e.id = a.edition_id
       WHERE ($1::text IS NULL OR a.category = $1)
       ORDER BY e.edition_date DESC, a.relevance_score DESC LIMIT 60`,
      [cat],
    );
  }
  // websearch_to_tsquery accepts "quoted phrases", OR and -exclusions; the ILIKE arm
  // catches tags and partial words that full-text stemming misses.
  return sql().unsafe<Article[]>(
    `SELECT ${ARTICLE_COLUMNS} FROM articles a JOIN editions e ON e.id = a.edition_id,
            websearch_to_tsquery('english', $1) q
     WHERE (a.search_vector @@ q OR a.title ILIKE '%' || $1 || '%' OR $1 = ANY(a.tags))
       AND ($2::text IS NULL OR a.category = $2)
     ORDER BY ts_rank(a.search_vector, q) DESC, e.edition_date DESC
     LIMIT 60`,
    [query, cat],
  );
}
