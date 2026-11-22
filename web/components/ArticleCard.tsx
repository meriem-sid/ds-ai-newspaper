"use client";

import type { Article } from "@/lib/data";
import { countdownLabel, daysUntil, eventWhen, hostOf, plain, shortDate } from "@/lib/format";
import { useArticleFlags } from "@/lib/readerState";

type Variant = "hero" | "lead" | "standard";

const TITLE: Record<Variant, string> = {
  hero: "text-[1.9rem] leading-[1.15] sm:text-[2.6rem] sm:leading-[1.1] font-semibold",
  lead: "text-[1.3rem] leading-snug font-semibold",
  standard: "text-[1.2rem] leading-snug font-semibold",
};

const BODY: Record<Variant, string> = {
  hero: "text-[1.1rem] leading-[1.7] sm:text-[1.175rem]",
  lead: "text-[1.0625rem] leading-[1.65]",
  standard: "text-[1.0625rem] leading-[1.65]",
};

export default function ArticleCard({
  article,
  today,
  variant = "standard",
  showEditionDate = false,
}: {
  article: Article;
  today: string;
  variant?: Variant;
  showEditionDate?: boolean;
}) {
  // Read/saved state lives in this visitor's browser only (lib/readerState.ts).
  const { isRead, isSaved, setRead, setSaved } = useArticleFlags(article.id);
  const flags = { is_read: isRead, is_bookmarked: isSaved };

  const toggleBookmark = () => setSaved(!isSaved);
  const toggleRead = () => setRead(!isRead);
  const markReadOnOpen = () => {
    if (!isRead) setRead(true); // opening the story counts as reading it
  };

  return (
    <article
      aria-label={article.title}
      className={`flex flex-col ${variant === "standard" ? "h-full" : ""} transition-opacity duration-200 ${
        flags.is_read ? "opacity-55 hover:opacity-90 focus-within:opacity-90" : ""
      }`}
    >
      <Meta article={article} today={today} showEditionDate={showEditionDate} />

      <h3 className={`mt-2 text-balance font-serif tracking-[-0.01em] text-ink ${TITLE[variant]}`}>
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="headline-link" onClick={markReadOnOpen}>
          {plain(article.title)}
        </a>
      </h3>

      <p className={`mt-3 max-w-[65ch] text-pretty text-text ${BODY[variant]}`}>{plain(article.what_happened)}</p>

      {article.why_it_matters && (
        <aside aria-label="Why it matters" className="mt-4 max-w-[65ch] rounded-r-md border-l-[3px] border-callout-edge bg-callout px-4 py-3">
          <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">Why it matters</p>
          <p className="mt-1 text-pretty text-[0.98rem] leading-[1.6] text-text">{plain(article.why_it_matters)}</p>
        </aside>
      )}

      <footer className={`flex items-center gap-3 pt-4 ${variant === "standard" ? "mt-auto" : ""}`}>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-x-2.5 gap-y-1 font-sans text-[0.75rem] text-muted" aria-label="Tags">
          {article.tags.slice(0, 4).map((t) => (
            <li key={t}>#{t}</li>
          ))}
          {article.related_urls.length > 0 && (
            <li title={article.related_urls.join("\n")}>
              +{article.related_urls.length} source{article.related_urls.length > 1 ? "s" : ""}
            </li>
          )}
        </ul>
        <span className="flex shrink-0 gap-0.5">
          <IconButton
            label={flags.is_read ? "Mark as unread" : "Mark as read"}
            pressed={flags.is_read}
            onClick={toggleRead}
            path={flags.is_read ? "M5 12.5l4.2 4.2L19 7" : "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 15a3 3 0 100-6 3 3 0 000 6z"}
          />
          <IconButton
            label={flags.is_bookmarked ? "Remove bookmark" : "Bookmark"}
            pressed={flags.is_bookmarked}
            onClick={toggleBookmark}
            path="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"
            filled={flags.is_bookmarked}
          />
        </span>
      </footer>
    </article>
  );
}

/** Source in small caps, then plain-case facts; only the urgent deadline gets colour. */
function Meta({ article, today, showEditionDate }: { article: Article; today: string; showEditionDate: boolean }) {
  const year = Number(today.slice(0, 4));
  const facts: React.ReactNode[] = [];

  if (showEditionDate) facts.push(<span key="ed">{shortDate(article.edition_date, year)}</span>);

  if (article.category === "job") {
    if (article.job_level) facts.push(<Badge key="lvl">{article.job_level}</Badge>);
    if (article.is_remote) facts.push(<Badge key="rem">Remote</Badge>);
  }
  if (article.category === "hackathon" || article.category === "webinar") {
    const fmt = article.event_format ?? (article.is_remote ? "online" : null);
    if (fmt) facts.push(<Badge key="fmt">{fmt.replace("_", "-")}</Badge>);
  }
  if (article.event_start && article.category !== "webinar") {
    facts.push(<span key="start">Starts {eventWhen(article.event_start, article.event_timezone).date}</span>);
  }
  if (article.deadline) {
    const days = daysUntil(article.deadline, today);
    const urgent = days >= 0 && days <= 7;
    facts.push(
      <span key="dl" className={urgent ? "font-semibold text-accent" : ""}>
        Deadline {shortDate(article.deadline, year)} · {countdownLabel(days)}
      </span>,
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-sans text-[0.78rem] text-muted">
      <span className="kicker text-muted">{article.source || hostOf(article.url)}</span>
      {facts.map((f, i) => (
        <span key={i} className="flex items-center gap-2.5">
          <span aria-hidden className="h-1 w-1 rounded-full bg-rule-strong/40" />
          {f}
        </span>
      ))}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-chip px-2 py-0.5 text-[0.72rem] font-medium capitalize text-ink/80">{children}</span>;
}

function IconButton({
  label,
  pressed,
  onClick,
  path,
  filled = false,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  path: string;
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-chip ${pressed ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        <path d={path} />
      </svg>
    </button>
  );
}
