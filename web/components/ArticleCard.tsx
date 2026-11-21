"use client";

import { useOptimistic, useTransition } from "react";
import { setBookmarked, setRead } from "@/app/actions";
import type { Article } from "@/lib/data";
import { countdownLabel, daysUntil, eventWhen, hostOf, plain, shortDate } from "@/lib/format";

type Variant = "hero" | "lead" | "standard";

type Flags = { is_bookmarked: boolean; is_read: boolean };

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
  const [, startTransition] = useTransition();
  const [flags, setFlags] = useOptimistic<Flags, Partial<Flags>>(
    { is_bookmarked: article.is_bookmarked, is_read: article.is_read },
    (state, patch) => ({ ...state, ...patch }),
  );

  const toggleBookmark = () =>
    startTransition(async () => {
      setFlags({ is_bookmarked: !flags.is_bookmarked });
      await setBookmarked(article.id, !flags.is_bookmarked);
    });

  const toggleRead = () =>
    startTransition(async () => {
      setFlags({ is_read: !flags.is_read });
      await setRead(article.id, !flags.is_read);
    });

  // Opening the story counts as reading it.
  const markReadOnOpen = () => {
    if (!flags.is_read) {
      startTransition(async () => {
        setFlags({ is_read: true });
        await setRead(article.id, true);
      });
    }
  };

  const titleSize =
    variant === "hero" ? "text-3xl sm:text-4xl leading-tight" : variant === "lead" ? "text-xl leading-snug" : "text-lg leading-snug";

  return (
    <article
      className={`group relative flex flex-col gap-2 transition-opacity ${variant === "standard" ? "h-full" : ""} ${flags.is_read ? "opacity-45 hover:opacity-80" : ""}`}
      aria-label={article.title}
    >
      <Meta article={article} today={today} showEditionDate={showEditionDate} />

      <h3 className={`font-serif font-semibold text-ink ${titleSize}`}>
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="headline-link" onClick={markReadOnOpen}>
          {plain(article.title)}
        </a>
      </h3>

      <p className={`text-ink/90 ${variant === "hero" ? "text-lg leading-relaxed" : "text-[0.98rem] leading-relaxed"}`}>
        {plain(article.what_happened)}
      </p>

      {article.why_it_matters && (
        <p className="border-l-2 border-rule pl-3 text-[0.95rem] italic leading-relaxed text-muted">
          <span className="kicker not-italic text-ink/70">Why it matters · </span>
          {plain(article.why_it_matters)}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        {article.tags.slice(0, 4).map((t) => (
          <span key={t} className="font-sans text-xs text-muted">
            #{t}
          </span>
        ))}
        {article.related_urls.length > 0 && (
          <span className="font-sans text-xs text-muted" title={article.related_urls.join("\n")}>
            +{article.related_urls.length} more source{article.related_urls.length > 1 ? "s" : ""}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          <IconButton
            label={flags.is_read ? "Mark as unread" : "Mark as read"}
            pressed={flags.is_read}
            onClick={toggleRead}
            path={flags.is_read ? "M5 12l4 4L19 6" : "M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z M12 15a3 3 0 100-6 3 3 0 000 6z"}
          />
          <IconButton
            label={flags.is_bookmarked ? "Remove bookmark" : "Bookmark"}
            pressed={flags.is_bookmarked}
            onClick={toggleBookmark}
            path="M6 3h12v18l-6-4-6 4z"
            filled={flags.is_bookmarked}
          />
        </span>
      </div>
    </article>
  );
}

function Meta({ article, today, showEditionDate }: { article: Article; today: string; showEditionDate: boolean }) {
  const year = Number(today.slice(0, 4));
  const bits: React.ReactNode[] = [];

  if (showEditionDate) bits.push(<span key="ed">{shortDate(article.edition_date, year)}</span>);
  bits.push(<span key="src">{article.source || hostOf(article.url)}</span>);

  if (article.category === "job") {
    if (article.job_level) bits.push(<Badge key="lvl">{article.job_level}</Badge>);
    if (article.is_remote) bits.push(<Badge key="rem">remote</Badge>);
  }
  if (article.category === "hackathon" || article.category === "webinar") {
    const fmt = article.event_format ?? (article.is_remote ? "online" : null);
    if (fmt) bits.push(<Badge key="fmt">{fmt.replace("_", "-")}</Badge>);
  }
  if (article.event_start && article.category !== "webinar") {
    const w = eventWhen(article.event_start, article.event_timezone);
    bits.push(<span key="start">starts {w.date}</span>);
  }
  if (article.deadline) {
    const days = daysUntil(article.deadline, today);
    bits.push(
      <span key="dl" className={days <= 7 && days >= 0 ? "font-semibold text-accent" : ""}>
        deadline {shortDate(article.deadline, year)} · {countdownLabel(days)}
      </span>,
    );
  }

  return <div className="kicker flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">{interleave(bits)}</div>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm bg-chip px-1.5 py-0.5 text-ink/80">{children}</span>;
}

function interleave(nodes: React.ReactNode[]) {
  return nodes.flatMap((n, i) => (i === 0 ? [n] : [<span key={`sep${i}`} aria-hidden>·</span>, n]));
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
      className={`rounded p-1.5 transition-colors hover:bg-chip ${pressed ? "text-ink" : "text-muted"}`}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        <path d={path} />
      </svg>
    </button>
  );
}
