import Link from "next/link";
import { getEdition, getEditionNav, getUrgentDeadlines, todayUTC, type Article } from "@/lib/data";
import { longDate } from "@/lib/format";
import ArticleCard from "./ArticleCard";
import DeadlineBanner from "./DeadlineBanner";
import FrontPageHero from "./FrontPageHero";
import JobsSection from "./JobsSection";
import Masthead from "./Masthead";
import Section, { EmptyNote } from "./Section";
import WebinarList from "./WebinarList";

/** A full edition: masthead, urgent deadlines, front page and the four sections. */
export default async function EditionView({ date }: { date?: string }) {
  const [result, nav, urgent] = await Promise.all([getEdition(date), getEditionNav(), getUrgentDeadlines(7)]);
  const today = todayUTC();

  if (!result) return <NoEdition date={date} nav={nav.dates} />;
  const { edition, articles } = result;
  const by = (c: Article["category"]) => articles.filter((a) => a.category === c);
  const hackathons = by("hackathon").sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));

  return (
    <>
      <Masthead edition={edition} nav={nav} />
      <DeadlineBanner articles={urgent} today={today} />
      <FrontPageHero articles={by("front_page")} today={today} />

      <Section id="research" title="Research & Deep Dives" count={by("research").length}>
        {by("research").length ? (
          <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {by("research").map((a) => (
              <ArticleCard key={a.id} article={a} today={today} />
            ))}
          </div>
        ) : (
          <EmptyNote>No research cleared the bar today.</EmptyNote>
        )}
      </Section>

      <Section id="hackathons" title="Hackathons & Competitions" count={hackathons.length}>
        {hackathons.length ? (
          <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {hackathons.map((a) => (
              <ArticleCard key={a.id} article={a} today={today} />
            ))}
          </div>
        ) : (
          <EmptyNote>No new open hackathons or competitions in this edition.</EmptyNote>
        )}
      </Section>

      <Section id="jobs" title="Jobs & Internships" count={by("job").length}>
        {by("job").length ? <JobsSection jobs={by("job")} today={today} /> : <EmptyNote>No new matching roles in this edition.</EmptyNote>}
      </Section>

      <Section id="webinars" title="Webinars & Events" count={by("webinar").length}>
        {by("webinar").length ? <WebinarList events={by("webinar")} today={today} /> : <EmptyNote>No upcoming online events in this edition.</EmptyNote>}
      </Section>
    </>
  );
}

function NoEdition({ date, nav }: { date?: string; nav: string[] }) {
  if (nav.length === 0) {
    return (
      <div className="mx-auto mt-24 max-w-xl text-center">
        <h1 className="font-serif text-3xl font-bold">No editions yet</h1>
        <p className="mt-3 text-muted">
          Run the pipeline once (<code className="font-mono text-sm">python -m pipeline.main</code>) to publish the first edition.
        </p>
      </div>
    );
  }
  // Nearest editions around the requested date (nav is newest-first).
  const before = date ? nav.find((d) => d < date) : undefined;
  const after = date ? [...nav].reverse().find((d) => d > date) : undefined;
  return (
    <div className="mx-auto mt-24 max-w-xl text-center">
      <h1 className="font-serif text-3xl font-bold">No edition {date ? `for ${longDate(date)}` : "found"}</h1>
      <p className="mt-4 flex justify-center gap-6 font-sans text-sm">
        {before && (
          <Link className="text-link underline" href={`/edition/${before}`}>
            ← {longDate(before)}
          </Link>
        )}
        {after && (
          <Link className="text-link underline" href={after === nav[0] ? "/" : `/edition/${after}`}>
            {longDate(after)} →
          </Link>
        )}
      </p>
    </div>
  );
}

export function EditionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading edition" className="animate-pulse pt-6">
      <div className="h-4 border-b border-rule" />
      <div className="mx-auto mt-6 h-14 w-3/4 rounded bg-chip" />
      <div className="mx-auto mt-4 h-6 w-1/2 rounded bg-chip" />
      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <div className="h-64 rounded bg-chip lg:col-span-2" />
        <div className="h-64 rounded bg-chip" />
      </div>
    </div>
  );
}
