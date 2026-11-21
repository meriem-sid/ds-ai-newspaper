import type { Article } from "@/lib/data";
import ArticleCard from "./ArticleCard";

/** Lead story (wide column, comfortable 65ch measure) + 2–4 stories in a column rule beside it. */
export default function FrontPageHero({ articles, today }: { articles: Article[]; today: string }) {
  if (articles.length === 0) return null;
  const [lead, ...rest] = articles;
  return (
    <section aria-label="Front page" className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <div className="lg:border-r lg:border-rule lg:pr-12">
        <ArticleCard article={lead} today={today} variant="hero" />
      </div>
      <div className="flex flex-col divide-y divide-rule border-t border-rule pt-8 lg:border-t-0 lg:pt-0">
        {rest.map((a) => (
          <div key={a.id} className="py-8 first:pt-0 last:pb-0">
            <ArticleCard article={a} today={today} variant="lead" />
          </div>
        ))}
      </div>
    </section>
  );
}
