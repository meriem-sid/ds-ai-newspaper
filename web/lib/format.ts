// Pure display helpers — safe in both server and client components.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Saturday, 21 November 2026" */
export function longDate(isoDate: string): string {
  const { y, m, d, dow } = parts(isoDate);
  return `${DAYS[dow]}, ${d} ${LONG_MONTHS[m - 1]} ${y}`;
}

/** "21 Nov" (+ year when it differs from `refYear`) */
export function shortDate(isoDate: string, refYear?: number): string {
  const { y, m, d } = parts(isoDate);
  return `${d} ${MONTHS[m - 1]}${refYear && y !== refYear ? ` ${y}` : ""}`;
}

/** Whole days from `today` to `isoDate` (both YYYY-MM-DD). */
export function daysUntil(isoDate: string, today: string): number {
  const toUTC = (s: string) => {
    const { y, m, d } = parts(s);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(isoDate) - toUTC(today)) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/**
 * Event start for display. The pipeline stores a date-only start as midnight UTC,
 * so a 00:00 UTC time is shown as just the date.
 */
export function eventWhen(iso: string, tz: string | null): { date: string; time: string | null } {
  const date = shortDate(iso);
  const hhmm = iso.slice(11, 16);
  if (!hhmm || hhmm === "00:00") return { date, time: null };
  return { date, time: `${hhmm} UTC${tz && !/^(utc|gmt|z)$/i.test(tz) ? ` (${tz})` : ""}` };
}

/**
 * Strip inline LaTeX delimiters copied from arXiv abstracts: "$R^2$" → "R^2", "$k$" → "k".
 * Only when the content looks like maths, so prices ("$67,500 ... $25,000") stay intact.
 */
export function plain(text: string): string {
  return text.replace(/\$([^$\n]{1,60})\$/g, (match, inner: string) =>
    /[\\^_{}]/.test(inner) || /^[A-Za-z]$/.test(inner) ? inner : match,
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const CATEGORY_LABELS: Record<string, string> = {
  front_page: "Front Page",
  research: "Research & Deep Dives",
  hackathon: "Hackathons & Competitions",
  job: "Jobs & Internships",
  webinar: "Webinars & Events",
};
