import type { Article } from "@/lib/data";
import ArticleCard from "./ArticleCard";

/**
 * Above the fold: the lead story (big headline, italic deck, drop cap) in a wide column,
 * the other front-page stories stacked in a ruled side column. With a single story, the
 * lead spans the page instead of leaving an empty column.
 */
export default function FrontPageHero({ articles, today }: { articles: Article[]; today: string }) {
  if (articles.length === 0) return null;
  const [lead, ...rest] = articles;
  return (
    <section id="front" aria-label="Front page" className="mt-8 scroll-mt-20 border-t-4 border-double border-rule-strong pt-6">
      <div className={rest.length ? "grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]" : ""}>
        <div className={rest.length ? "lg:border-r lg:border-rule lg:pr-10" : "max-w-4xl"}>
          <ArticleCard article={lead} today={today} variant="hero" />
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
