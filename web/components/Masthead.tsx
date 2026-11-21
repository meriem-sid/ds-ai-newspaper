import Link from "next/link";
import type { Edition, EditionNav } from "@/lib/data";
import { longDate } from "@/lib/format";
import EditionPicker from "./EditionPicker";

export default function Masthead({ edition, nav }: { edition: Edition; nav: EditionNav }) {
  const idx = nav.dates.indexOf(edition.edition_date); // dates are newest-first
  const newer = idx > 0 ? nav.dates[idx - 1] : null;
  const older = idx >= 0 && idx < nav.dates.length - 1 ? nav.dates[idx + 1] : null;

  return (
    <header className="pt-8 sm:pt-12">
      {/* Edition bar: date · edition controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 font-sans text-[0.8125rem] text-muted">
        <p className="font-medium text-text">{longDate(edition.edition_date)}</p>
        <div className="flex items-center gap-1">
          <EditionArrow href={older ? `/edition/${older}` : null} label="Previous edition" dir="prev" />
          <span className="px-2 font-medium tabular-nums text-text">No. {edition.number}</span>
          <EditionArrow href={newer ? (newer === nav.last ? "/" : `/edition/${newer}`) : null} label="Next edition" dir="next" />
          <span aria-hidden className="mx-2 h-4 w-px bg-rule" />
          <EditionPicker value={edition.edition_date} min={nav.first} max={nav.last} />
        </div>
      </div>

      {/* Nameplate */}
      <div className="mt-8 border-y border-rule-strong py-6 text-center sm:mt-10 sm:py-8">
        <h1 className="text-balance font-serif text-[2.4rem] font-bold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[3.6rem] lg:text-[4.2rem]">
          The Data Science &amp; AI Newspaper
        </h1>
        <p className="mt-3 font-sans text-[0.8125rem] text-muted">Research, releases, hackathons, jobs &amp; events — high signal, zero hype</p>
      </div>

      {edition.summary_headline && (
        <p className="mx-auto mt-6 max-w-3xl text-balance text-center font-serif text-[1.2rem] italic leading-snug text-text sm:text-[1.4rem]">
          {edition.summary_headline}
        </p>
      )}
    </header>
  );
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
