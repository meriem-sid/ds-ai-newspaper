import type { Article } from "@/lib/data";
import { CATEGORY_LABELS, countdownLabel, daysUntil, plain, shortDate } from "@/lib/format";
import ReadDim from "./ReadDim";

/** Everything (from any edition) with a deadline in the next 7 days. */
export default function DeadlineBanner({ articles, today }: { articles: Article[]; today: string }) {
  if (articles.length === 0) return null;
  const year = Number(today.slice(0, 4));
  return (
    <section aria-labelledby="deadlines-heading" className="mt-10 rounded-lg border border-accent/30 bg-accent-soft/70 px-5 py-4 sm:px-6">
      <h2 id="deadlines-heading" className="flex items-center gap-2 font-sans text-[0.8125rem] font-semibold text-accent">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
        Closing within 7 days
      </h2>
      <ul className="mt-3 grid gap-x-10 gap-y-2.5 md:grid-cols-2">
        {articles.map((a) => {
          const days = daysUntil(a.deadline!, today);
          return (
            <ReadDim key={a.id} id={a.id} className="flex items-baseline gap-3">
              <span className="w-[5.5rem] shrink-0 font-sans text-[0.78rem] font-semibold tabular-nums text-accent">{countdownLabel(days)}</span>
              <span className="min-w-0 leading-snug">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="headline-link font-semibold text-ink">
                  {plain(a.title)}
                </a>
                <span className="font-sans text-[0.75rem] text-muted">
                  {" "}
                  · {CATEGORY_LABELS[a.category]?.split(" ")[0] ?? a.category} · {shortDate(a.deadline!, year)}
                </span>
              </span>
            </ReadDim>
          );
        })}
      </ul>
    </section>
  );
}
