import type { Article } from "@/lib/data";
import ArticleCard from "./ArticleCard";

/** Lead story across two columns, the rest (2–4) stacked beside it. */
export default function FrontPageHero({ articles, today }: { articles: Article[]; today: string }) {
  if (articles.length === 0) return null;
  const [lead, ...rest] = articles;
  return (
    <section aria-label="Front page" className="mt-8 grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 lg:border-r lg:border-rule lg:pr-8">
        <ArticleCard article={lead} today={today} variant="hero" />
      </div>
      <div className="flex flex-col divide-y divide-rule">
        {rest.map((a) => (
          <div key={a.id} className="py-5 first:pt-0 last:pb-0">
            <ArticleCard article={a} today={today} variant="lead" />
          </div>
        ))}
      </div>
    </section>
  );
}
