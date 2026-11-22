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
