import type { Article } from "@/lib/data";
import { plain } from "@/lib/format";
import ArticleCard from "./ArticleCard";

export type InsideEntry = { id: string; label: string; count: number; headline: string };

/**
 * Above the fold: the lead story (big headline, italic deck, drop cap) in a wide column and
 * the other front-page stories in a ruled side column. Lead copy is short (two sentences), so
 * under it sits an "Inside today's paper" box — each section's top headline — which fills the
 * column with something useful instead of leaving a hole beside the taller side column.
 * With a single front-page story, the lead spans the page.
 */
export default function FrontPageHero({ articles, today, inside = [] }: { articles: Article[]; today: string; inside?: InsideEntry[] }) {
  if (articles.length === 0) return null;
  const [lead, ...rest] = articles;
  return (
    <section id="front" aria-label="Front page" className="mt-8 scroll-mt-20 border-t-4 border-double border-rule-strong pt-6">
      <div className={rest.length ? "grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]" : ""}>
        <div className={rest.length ? "lg:border-r lg:border-rule lg:pr-10" : "max-w-4xl"}>
          <ArticleCard article={lead} today={today} variant="hero" />
          {rest.length > 0 && inside.length > 0 && <InsideBox entries={inside} />}
        </div>
        {rest.length > 0 && (
          <div className="flex flex-col divide-y divide-rule border-t border-rule pt-6 lg:border-t-0 lg:pt-0">
            {rest.map((a) => (
              <div key={a.id} className="py-5 first:pt-0 last:pb-0">
                <ArticleCard article={a} today={today} variant="lead" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function InsideBox({ entries }: { entries: InsideEntry[] }) {
  return (
    <aside aria-labelledby="inside-heading" className="mt-8 border-t-2 border-rule-strong pt-3">
      <h2 id="inside-heading" className="kicker text-ink">
        Inside today&apos;s paper
      </h2>
      <ul className="mt-2 divide-y divide-rule">
        {entries.map((e) => (
          <li key={e.id}>
            <a href={`#${e.id}`} className="group grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <span className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">
                {e.label} <span className="font-normal tabular-nums">{e.count}</span>
              </span>
              <span className="font-headline text-[1.02rem] leading-snug text-ink group-hover:text-link">
                {plain(e.headline)} <span aria-hidden className="text-muted group-hover:text-link">→</span>
              </span>
            </a>
          </li>
        ))}
        <li>
          <a href="/games" className="group grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <span className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">Puzzles 2</span>
            <span className="font-headline text-[1.02rem] leading-snug text-ink group-hover:text-link">
              Today&apos;s Sudoku and Binary Grid — post your time <span aria-hidden className="text-muted group-hover:text-link">→</span>
            </span>
          </a>
        </li>
      </ul>
    </aside>
  );
}
