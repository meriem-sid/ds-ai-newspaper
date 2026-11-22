import Link from "next/link";
import type { Edition, EditionNav } from "@/lib/data";
import { longDate } from "@/lib/format";
import EditionPicker from "./EditionPicker";

export type IndexEntry = { id: string; label: string; count: number };

/**
 * A broadsheet masthead: volume/edition line, nameplate with "ears" on either side,
 * a dateline between rules, the day's banner headline, and an "Inside today" index.
 */
export default function Masthead({
  edition,
  nav,
  index,
  storyCount,
  closingSoon,
}: {
  edition: Edition;
  nav: EditionNav;
  index: IndexEntry[];
  storyCount: number;
  closingSoon: number;
}) {
  const idx = nav.dates.indexOf(edition.edition_date); // dates are newest-first
  const newer = idx > 0 ? nav.dates[idx - 1] : null;
  const older = idx >= 0 && idx < nav.dates.length - 1 ? nav.dates[idx + 1] : null;

  return (
    <header className="pt-5 sm:pt-7">
      {/* Edition line: volume/number on the left, past-edition controls on the right */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-sans text-[0.78rem] text-muted">
        <p className="font-medium uppercase tracking-[0.12em]">
          Vol. I · No. {edition.number}
        </p>
        <div className="flex items-center gap-1">
          <EditionArrow href={older ? `/edition/${older}` : null} label="Previous edition" dir="prev" />
          <EditionArrow href={newer ? (newer === nav.last ? "/" : `/edition/${newer}`) : null} label="Next edition" dir="next" />
          <span aria-hidden className="mx-2 h-4 w-px bg-rule" />
          <EditionPicker value={edition.edition_date} min={nav.first} max={nav.last} />
        </div>
      </div>

      {/* Nameplate with ears */}
      <div className="nameplate mt-4 grid items-center gap-4 px-4 py-5 sm:py-6 lg:grid-cols-[11rem_minmax(0,1fr)_11rem] lg:px-5">
        <Ear className="hidden lg:block">
          <span className="block font-semibold uppercase tracking-[0.1em]">Today&apos;s paper</span>
          <span className="mt-1 block">
            {storyCount} {storyCount === 1 ? "story" : "stories"}
            {closingSoon > 0 && (
              <>
                <br />
                {closingSoon} closing this week
              </>
            )}
          </span>
        </Ear>
        <div className="text-center">
          <h1 className="font-headline text-balance text-[2.3rem] leading-[1.02] tracking-[-0.02em] sm:text-[3.5rem] lg:text-[4.1rem]">
            The Data Science &amp; AI Newspaper
          </h1>
          <p className="nameplate-sub mt-2 font-sans text-[0.78rem] uppercase tracking-[0.14em]">High signal · Zero hype</p>
        </div>
        <Ear className="hidden lg:block">
          <span className="block font-semibold uppercase tracking-[0.1em]">Daily puzzles</span>
          <span className="mt-1 block">
            <Link href="/games/sudoku" className="underline decoration-1 underline-offset-2 hover:opacity-80">
              Sudoku
            </Link>{" "}
            ·{" "}
            <Link href="/games/binary" className="underline decoration-1 underline-offset-2 hover:opacity-80">
              Binary Grid
            </Link>
          </span>
        </Ear>
      </div>

      {/* Dateline between rules */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-b-4 border-double border-rule-strong py-1.5 font-sans text-[0.72rem] uppercase tracking-[0.14em] text-muted">
        <span className="text-text">{longDate(edition.edition_date)}</span>
        <span className="hidden sm:inline">Research · Releases · Hackathons · Jobs · Events</span>
        <span>Daily at 06:00 UTC</span>
      </div>

      {/* Banner headline for the day */}
      {edition.summary_headline && (
        <p className="mx-auto mt-5 max-w-4xl text-balance text-center font-headline text-[1.35rem] italic leading-snug text-ink sm:text-[1.7rem]">
          {edition.summary_headline}
        </p>
      )}

      {/* Inside today: jump links with counts */}
      {index.length > 0 && (
        <nav aria-label="Inside today" className="mt-5 flex flex-wrap items-baseline justify-center gap-x-1 gap-y-2 font-sans text-[0.82rem]">
          <span className="mr-2 font-semibold uppercase tracking-[0.12em] text-muted">Inside today</span>
          {index.map((e, i) => (
            <span key={e.id} className="flex items-baseline">
              {i > 0 && <span aria-hidden className="mx-2 text-rule-strong/40">|</span>}
              <a href={`#${e.id}`} className="text-text hover:text-link hover:underline">
                {e.label} <span className="tabular-nums text-muted">{e.count}</span>
              </a>
            </span>
          ))}
        </nav>
      )}
    </header>
  );
}

function Ear({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ear px-3 py-2 text-center font-sans text-[0.72rem] leading-snug ${className}`}>{children}</div>;
}

function EditionArrow({ href, label, dir }: { href: string | null; label: string; dir: "prev" | "next" }) {
  const icon = (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
  const base = "flex h-8 w-8 items-center justify-center rounded-full";
  return href ? (
    <Link href={href} aria-label={label} title={label} className={`${base} text-muted transition-colors hover:bg-chip hover:text-ink`}>
      {icon}
    </Link>
  ) : (
    <span aria-hidden className={`${base} text-rule`}>
      {icon}
    </span>
  );
}
