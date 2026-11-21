import type { Article } from "@/lib/data";
import { eventWhen } from "@/lib/format";
import ArticleCard from "./ArticleCard";

/** Chronological: soonest event first, undated (deadline-only) events last. */
export default function WebinarList({ events, today }: { events: Article[]; today: string }) {
  const sorted = [...events].sort((a, b) => (a.event_start ?? a.deadline ?? "9999").localeCompare(b.event_start ?? b.deadline ?? "9999"));
  return (
    <ol className="divide-y divide-rule">
      {sorted.map((a) => {
        const when = a.event_start ? eventWhen(a.event_start, a.event_timezone) : null;
        const [day, month] = (when?.date ?? "").split(" ");
        return (
          <li key={a.id} className="grid grid-cols-[4.5rem_1fr] gap-5 py-5 first:pt-0">
            <div className="text-center" aria-label={when ? `${when.date}${when.time ? `, ${when.time}` : ""}` : "Date to be announced"}>
              {when ? (
                <>
                  <div className="font-serif text-3xl font-bold leading-none">{day}</div>
                  <div className="kicker mt-1 text-muted">{month}</div>
                  {when.time && <div className="mt-1 font-sans text-[0.7rem] leading-tight text-muted">{when.time}</div>}
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
