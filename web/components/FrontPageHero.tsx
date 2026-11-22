import type { Article } from "@/lib/data";
import ArticleCard from "./ArticleCard";
import { StoryGrid } from "./Section";

/**
 * Above the fold, broadsheet style: the lead story runs across the full width (big headline,
 * italic deck, text set in two columns), and the other front-page stories sit below it side by
 * side in balanced columns. No side rail, so there's nothing to fall out of step with the lead.
 */
export default function FrontPageHero({ articles, today }: { articles: Article[]; today: string }) {
  if (articles.length === 0) return null;
  const [lead, ...rest] = articles;
  return (
    <section id="front" aria-label="Front page" className="mt-8 scroll-mt-20 border-t-4 border-double border-rule-strong pt-6">
      <ArticleCard article={lead} today={today} variant="hero" />
      {rest.length > 0 && (
        <div className="mt-8 border-t-2 border-rule-strong pt-6">
          <StoryGrid>
            {rest.map((a) => (
              <ArticleCard key={a.id} article={a} today={today} variant="lead" />
            ))}
          </StoryGrid>
        </div>
      )}
    </section>
  );
}
