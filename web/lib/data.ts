import "server-only";
import { connection } from "next/server";
import { sql } from "./db";

export type Category = "front_page" | "research" | "hackathon" | "job" | "webinar";

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
  is_bookmarked: boolean;
  is_read: boolean;
  related_urls: string[];
  event_start: string | null; // ISO, UTC
  event_timezone: string | null;
  is_remote: boolean | null;
  event_format: string | null;
  job_level: string | null;
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
  coalesce(a.tags, '{}') AS tags, a.is_bookmarked, a.is_read,
  coalesce(a.related_urls, '{}') AS related_urls,
  to_char(a.event_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS event_start,
  a.event_timezone, a.is_remote, a.event_format, a.job_level,
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

export async function getSaved(): Promise<Article[]> {
  await connection();
  return sql().unsafe<Article[]>(
    `SELECT ${ARTICLE_COLUMNS} FROM articles a JOIN editions e ON e.id = a.edition_id
     WHERE a.is_bookmarked ORDER BY e.edition_date DESC, a.relevance_score DESC`,
  );
}

export const ARCHIVE_CATEGORIES: Category[] = ["front_page", "research", "hackathon", "job", "webinar"];

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

export async function setArticleFlag(id: number, flag: "is_bookmarked" | "is_read", value: boolean) {
  const db = sql();
  if (flag === "is_bookmarked") await db`UPDATE articles SET is_bookmarked = ${value} WHERE id = ${id}`;
  else await db`UPDATE articles SET is_read = ${value} WHERE id = ${id}`;
}
