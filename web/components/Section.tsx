import BalancedColumns, { type PullQuoteCandidate } from "./BalancedColumns";

export type Tone = "front" | "research" | "hackathon" | "job" | "webinar" | "resource";

/** category → section colour (colourful style; classic renders them all as plain rules) */
export const TONE_BY_CATEGORY: Record<string, Tone> = {
  front_page: "front",
  research: "research",
  hackathon: "hackathon",
  job: "job",
  webinar: "webinar",
  resource: "resource",
};

export default function Section({
  id,
  title,
  tone,
  count,
  children,
  aside,
}: {
  id: string;
  title: string;
  tone?: Tone;
  count?: number;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-12 scroll-mt-20 sm:mt-14">
      <SectionHeading id={`${id}-heading`} title={title} tone={tone} count={count} aside={aside} />
      {children}
    </section>
  );
}

/** A rule + title (classic) or a colour-coded label on a coloured rule (colourful). */
export function SectionHeading({ id, title, tone, count, aside }: { id?: string; title: string; tone?: Tone; count?: number; aside?: React.ReactNode }) {
  return (
    <div data-tone={tone} className="section-head mb-6 flex flex-wrap items-baseline justify-between gap-3 pt-2.5">
      <h2 id={id} className="font-headline text-[1.6rem] tracking-[-0.01em] sm:text-[1.85rem]">
        <span className="section-title">{title}</span>
        {count !== undefined && <span className="ml-3 align-middle font-sans text-[0.8125rem] font-medium text-muted">{count}</span>}
      </h2>
      {aside}
    </div>
  );
}

/** Newspaper columns that end level (see BalancedColumns). */
export function StoryGrid({ children, cols = 3, pullQuotes }: { children: React.ReactNode; cols?: 2 | 3; pullQuotes?: PullQuoteCandidate[] }) {
  return (
    <BalancedColumns cols={cols} pullQuotes={pullQuotes}>
      {children}
    </BalancedColumns>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="font-sans text-[0.9rem] text-muted">{children}</p>;
}
