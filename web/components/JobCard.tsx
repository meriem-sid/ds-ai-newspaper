"use client";

import type { Article } from "@/lib/data";
import { countdownLabel, daysUntil, hostOf, plain, postedAgo, shortDate } from "@/lib/format";
import { useArticleFlags } from "@/lib/readerState";
import { IconButton } from "./ArticleCard";

const LEVEL_LABEL: Record<string, string> = {
  internship: "Internship",
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
};

/** A compact job listing: role, company, where, level, when — then one line of detail. */
export default function JobCard({ job, today }: { job: Article; today: string }) {
  const { isRead, isSaved, setRead, setSaved } = useArticleFlags(job.id);
  const year = Number(today.slice(0, 4));
  const where = job.location || (job.is_remote ? "Remote" : null);
  const deadlineDays = job.deadline ? daysUntil(job.deadline, today) : null;

  return (
    <article
      aria-label={`${job.title}${job.company ? ` at ${job.company}` : ""}`}
      className={`flex flex-col transition-opacity duration-200 ${isRead ? "opacity-55 hover:opacity-90 focus-within:opacity-90" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-sans text-[0.75rem]">
        {job.job_level && (
          <span className="rounded-full bg-chip px-2 py-0.5 font-medium text-ink/80">{LEVEL_LABEL[job.job_level] ?? job.job_level}</span>
        )}
        {job.is_remote && <span className="rounded-full bg-chip px-2 py-0.5 font-medium text-ink/80">Remote</span>}
        <span className="kicker ml-auto text-kicker">{job.source || hostOf(job.url)}</span>
      </div>

      <h3 className="font-headline mt-2.5 text-balance text-[1.2rem] leading-snug tracking-[-0.01em] text-ink">
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="headline-link" onClick={() => !isRead && setRead(true)}>
          {plain(job.title)}
        </a>
      </h3>

      {/* Company · location */}
      <p className="mt-1 font-sans text-[0.9rem] text-text">
        {job.company && <span className="font-semibold">{job.company}</span>}
        {job.company && where && <span className="text-muted"> · </span>}
        {where && <span className="text-muted">{where}</span>}
      </p>

      <p className="np-body mt-2.5 text-[0.98rem] leading-[1.6] text-text">{plain(job.what_happened)}</p>

      <footer className="flex items-center gap-3 pt-3">
        <p className="min-w-0 flex-1 font-sans text-[0.78rem] text-muted">
          {deadlineDays !== null && deadlineDays >= 0 ? (
            <span className={deadlineDays <= 7 ? "font-semibold text-accent" : ""}>
              Apply by {shortDate(job.deadline!, year)} · {countdownLabel(deadlineDays)}
            </span>
          ) : job.posted_on ? (
            <>Posted {postedAgo(job.posted_on, today)}</>
          ) : (
            <>Listed {shortDate(job.edition_date, year)}</>
          )}
        </p>
        <span className="flex shrink-0 gap-0.5">
          <IconButton
            label={isRead ? "Mark as unread" : "Mark as read"}
            pressed={isRead}
            onClick={() => setRead(!isRead)}
            path={isRead ? "M5 12.5l4.2 4.2L19 7" : "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 15a3 3 0 100-6 3 3 0 000 6z"}
          />
          <IconButton
            label={isSaved ? "Remove bookmark" : "Bookmark"}
            pressed={isSaved}
            onClick={() => setSaved(!isSaved)}
            path="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"
            filled={isSaved}
          />
        </span>
      </footer>
    </article>
  );
}
