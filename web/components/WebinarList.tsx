import type { Article } from "@/lib/data";
import { eventWhen } from "@/lib/format";
import ArticleCard from "./ArticleCard";

/** Chronological: soonest event first, undated (deadline-only) events last. */
export default function WebinarList({ events, today }: { events: Article[]; today: string }) {
  const sorted = [...events].sort((a, b) => (a.event_start ?? a.deadline ?? "9999").localeCompare(b.event_start ?? b.deadline ?? "9999"));
  return (
    <ol className="divide-y divide-rule border-t border-rule">
      {sorted.map((a) => {
        const when = a.event_start ? eventWhen(a.event_start, a.event_timezone) : null;
        const [day, month] = (when?.date ?? "").split(" ");
        return (
          <li key={a.id} className="grid grid-cols-[4.25rem_1fr] gap-5 py-8 sm:grid-cols-[5.5rem_1fr] sm:gap-8">
            <div className="pt-1 text-center" aria-label={when ? `${when.date}${when.time ? `, ${when.time}` : ""}` : "Date to be announced"}>
              {when ? (
                <>
                  <div className="font-headline text-[2.2rem] leading-none tabular-nums text-ink">{day}</div>
                  <div className="kicker mt-1.5 text-kicker">{month}</div>
                  {when.time && <div className="mt-1.5 font-sans text-[0.72rem] leading-tight text-muted">{when.time}</div>}
                </>
              ) : (
                <div className="kicker text-muted">TBA</div>
              )}
            </div>
            <ArticleCard article={a} today={today} />
          </li>
        );
      })}
    </ol>
  );
}
