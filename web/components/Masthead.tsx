import Link from "next/link";
import type { Edition, EditionNav } from "@/lib/data";
import { longDate } from "@/lib/format";
import EditionPicker from "./EditionPicker";

export default function Masthead({ edition, nav }: { edition: Edition; nav: EditionNav }) {
  const idx = nav.dates.indexOf(edition.edition_date); // dates are newest-first
  const newer = idx > 0 ? nav.dates[idx - 1] : null;
  const older = idx >= 0 && idx < nav.dates.length - 1 ? nav.dates[idx + 1] : null;

  return (
    <header className="pt-6 text-center">
      <div className="kicker flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2 text-muted">
        <span>{longDate(edition.edition_date)}</span>
        <span className="flex items-center gap-3">
          {older ? (
            <Link href={`/edition/${older}`} className="hover:text-ink" aria-label="Previous edition">
              ← Prev
            </Link>
          ) : (
            <span className="opacity-40">← Prev</span>
          )}
          <span className="text-ink">No. {edition.number}</span>
          {newer ? (
            <Link href={newer === nav.last ? "/" : `/edition/${newer}`} className="hover:text-ink" aria-label="Next edition">
              Next →
            </Link>
          ) : (
            <span className="opacity-40">Next →</span>
          )}
        </span>
        <EditionPicker value={edition.edition_date} min={nav.first} max={nav.last} />
      </div>

      <h1 className="mt-5 font-serif text-4xl font-bold tracking-tight sm:text-6xl">The Data Science &amp; AI Newspaper</h1>
      <p className="kicker mt-2 text-muted">Research · Releases · Hackathons · Jobs · Events — high signal, zero hype</p>

      {edition.summary_headline && (
        <p className="mx-auto mt-4 max-w-3xl border-y-2 border-rule-strong py-2 font-serif text-lg italic sm:text-xl">
          {edition.summary_headline}
        </p>
      )}
    </header>
  );
}
