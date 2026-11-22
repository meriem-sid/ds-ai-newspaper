import { plain } from "@/lib/format";

/** A newspaper pull quote: a line lifted from a story on the page, set large between rules. */
export default function PullQuote({ text, source }: { text: string; source: string }) {
  return (
    <figure className="np-pullquote" aria-hidden="true">
      <blockquote className="font-headline text-balance text-[1.3rem] italic leading-snug text-ink">
        &ldquo;{plain(text)}&rdquo;
      </blockquote>
      <figcaption className="mt-3 font-sans text-[0.72rem] uppercase tracking-[0.12em] text-muted">On: {plain(source)}</figcaption>
    </figure>
  );
}

/** Pull-quote candidates for a section: each story's "why it matters", best story first. */
export function pullQuotesFor(items: { id: number; title: string; why_it_matters: string | null; relevance_score: number | null; company?: string | null }[]) {
  return [...items]
    .filter((a) => a.why_it_matters)
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
    .map((a) => ({
      key: String(a.id),
      node: <PullQuote text={a.why_it_matters!} source={a.company ? `${a.title} · ${a.company}` : a.title} />,
    }));
}
