import type { Article } from "@/lib/data";
import { CATEGORY_LABELS, countdownLabel, daysUntil, shortDate } from "@/lib/format";

/** Everything (from any edition) with a deadline in the next 7 days. */
export default function DeadlineBanner({ articles, today }: { articles: Article[]; today: string }) {
  if (articles.length === 0) return null;
  const year = Number(today.slice(0, 4));
  return (
    <section aria-labelledby="deadlines-heading" className="mt-6 border-y-2 border-accent bg-accent-soft/60 px-4 py-3">
      <h2 id="deadlines-heading" className="kicker mb-2 flex items-center gap-2 text-accent">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
        Closing within 7 days
      </h2>
      <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {articles.map((a) => {
          const days = daysUntil(a.deadline!, today);
          return (
            <li key={a.id} className={`flex items-baseline gap-3 ${a.is_read ? "opacity-60" : ""}`}>
              <span className="kicker w-24 shrink-0 font-bold text-accent">{countdownLabel(days)}</span>
              <span className="min-w-0">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="headline-link font-semibold">
                  {a.title}
                </a>
                <span className="font-sans text-xs text-muted">
                  {" "}
                  · {CATEGORY_LABELS[a.category]?.split(" ")[0] ?? a.category} · {shortDate(a.deadline!, year)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
