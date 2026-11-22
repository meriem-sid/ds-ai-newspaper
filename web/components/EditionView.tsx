import Link from "next/link";
import { getEdition, getEditionNav, getUrgentDeadlines, todayUTC, type Article } from "@/lib/data";
import { longDate } from "@/lib/format";
import ArticleCard from "./ArticleCard";
import DeadlineBanner from "./DeadlineBanner";
import FrontPageHero from "./FrontPageHero";
import JobsSection from "./JobsSection";
import Masthead, { type IndexEntry } from "./Masthead";
import Section, { EmptyNote, StoryGrid, type Tone } from "./Section";
import { pullQuotesFor } from "./PullQuote";
import WebinarList from "./WebinarList";

/**
 * A full edition laid out like a broadsheet: masthead + index, urgent deadlines, the front
 * page, then only the sections that have stories today (no empty headings, no holes).
 */
export default async function EditionView({ date }: { date?: string }) {
  const [result, nav, urgent] = await Promise.all([getEdition(date), getEditionNav(), getUrgentDeadlines(7)]);
  const today = todayUTC();

  if (!result) return <NoEdition date={date} nav={nav.dates} />;
  const { edition, articles } = result;
  const byScore = (a: Article, b: Article) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0);

  // A quiet day can have no front page at all: promote the day's best stories instead,
  // so the paper never opens straight onto section headings.
  let front = articles.filter((a) => a.category === "front_page");
  if (front.length === 0) {
    front = articles.filter((a) => a.category === "research" || a.category === "resource").sort(byScore).slice(0, 3);
  }
  const onFront = new Set(front.map((a) => a.id));
  const by = (c: Article["category"]) => articles.filter((a) => a.category === c && !onFront.has(a.id));

  const sections: { id: string; label: string; title: string; tone: Tone; items: Article[]; body: React.ReactNode }[] = [];
  const add = (id: string, label: string, title: string, tone: Tone, items: Article[], body: (items: Article[]) => React.ReactNode) => {
    if (items.length) sections.push({ id, label, title, tone, items, body: body(items) });
  };
  const columns = (items: Article[]) => (
    <StoryGrid pullQuotes={pullQuotesFor(items)}>
      {items.map((a) => (
        <ArticleCard key={a.id} article={a} today={today} />
      ))}
    </StoryGrid>
  );
  add("research", "Research", "Research & Deep Dives", "research", by("research"), columns);
  add("resources", "Tools", "Tools & Resources", "resource", by("resource"), columns);
  add("hackathons", "Hackathons", "Hackathons & Competitions", "hackathon",
    by("hackathon").sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")), columns);
  add("jobs", "Jobs", "Jobs", "job", by("job"), (items) => <JobsSection jobs={items} today={today} />);
  add("webinars", "Events", "Webinars & Events", "webinar", by("webinar"), (items) => <WebinarList events={items} today={today} />);

  const index: IndexEntry[] = [
    ...(front.length ? [{ id: "front", label: "Front page", count: front.length }] : []),
    ...sections.map((s) => ({ id: s.id, label: s.label, count: s.items.length })),
  ];

  return (
    <>
      <Masthead edition={edition} nav={nav} index={index} storyCount={articles.length} closingSoon={urgent.length} />
      <DeadlineBanner articles={urgent} today={today} />
      <FrontPageHero articles={front} today={today} />
      {sections.map((s) => (
        <Section key={s.id} id={s.id} tone={s.tone} title={s.title} count={s.items.length}>
          {s.body}
        </Section>
      ))}
      {articles.length === 0 && <EmptyNote>No stories cleared the bar in this edition.</EmptyNote>}
    </>
  );
}

function NoEdition({ date, nav }: { date?: string; nav: string[] }) {
  if (nav.length === 0) {
    return (
      <div className="mx-auto mt-24 max-w-xl text-center">
        <h1 className="font-serif text-3xl font-semibold text-ink">No editions yet</h1>
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
      <h1 className="text-balance font-serif text-3xl font-semibold text-ink">No edition {date ? `for ${longDate(date)}` : "found"}</h1>
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
