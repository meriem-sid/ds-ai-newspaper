import Link from "next/link";
import { getEdition, getEditionNav, getLiveBoards, getRecentResearch, getUrgentDeadlines, todayUTC, type Article } from "@/lib/data";
import { longDate } from "@/lib/format";
import ArticleCard, { type Stamp } from "./ArticleCard";
import DeadlineBanner from "./DeadlineBanner";
import FrontPageHero from "./FrontPageHero";
import JobsSection from "./JobsSection";
import Masthead, { type IndexEntry } from "./Masthead";
import Section, { EmptyNote, StoryGrid, type Tone } from "./Section";
import { pullQuotesFor } from "./PullQuote";
import WebinarList from "./WebinarList";

/** On today's page, top research up to this many stories with the week's best (dated). */
const MIN_RESEARCH = 6;

/**
 * A full edition laid out like a broadsheet: masthead + index, urgent deadlines, the front
 * page, then only the sections that have stories (no empty headings, no holes).
 *
 * Today's page (no `date`) is a living paper: hackathons, jobs and events come from running
 * boards (still open / recent), and thin research is topped up with the week's best. Anything
 * found today is badged "New". A past edition (`date`) shows exactly what that day published.
 */
export default async function EditionView({ date }: { date?: string }) {
  const live = !date;
  const [result, nav, urgent, boards] = await Promise.all([
    getEdition(date),
    getEditionNav(),
    getUrgentDeadlines(7),
    live ? getLiveBoards() : Promise.resolve(null),
  ]);
  const today = todayUTC();

  if (!result) return <NoEdition date={date} nav={nav.dates} />;
  const { edition, articles } = result;
  const byScore = (a: Article, b: Article) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
  const stampOf = (a: Article): Stamp | undefined => (live ? (a.edition_date === edition.edition_date ? "new" : "dated") : undefined);

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
  // Only stamp items on boards/backfill: today's own news needs no "New" badge.
  const columns = (items: Article[], stamped = false) => (
    <StoryGrid pullQuotes={pullQuotesFor(items)}>
      {items.map((a) => (
        <ArticleCard key={a.id} article={a} today={today} stamp={stamped ? stampOf(a) : undefined} />
      ))}
    </StoryGrid>
  );

  let research = by("research");
  if (live && research.length < MIN_RESEARCH) {
    const extra = await getRecentResearch(edition.edition_date, MIN_RESEARCH - research.length, articles.map((a) => a.id));
    research = [...research, ...extra];
  }
  const researchHasOlder = research.some((a) => a.edition_date !== edition.edition_date);

  add("research", "Research", "Research & Deep Dives", "research", research, (items) => columns(items, researchHasOlder));
  add("resources", "Tools", "Tools & Resources", "resource", by("resource"), (items) => columns(items));
  add("hackathons", "Hackathons", "Hackathons & Competitions", "hackathon",
    boards ? boards.hackathons : by("hackathon").sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")),
    (items) => columns(items, live));
  add("jobs", "Jobs", "Jobs", "job", boards ? boards.jobs : by("job"),
    (items) => <JobsSection jobs={items} today={today} newOn={live ? edition.edition_date : undefined} />);
  add("webinars", "Events", "Webinars & Events", "webinar", boards ? boards.webinars : by("webinar"),
    (items) => <WebinarList events={items} today={today} />);

  const index: IndexEntry[] = [
    ...(front.length ? [{ id: "front", label: "Front page", count: front.length }] : []),
    ...sections.map((s) => ({ id: s.id, label: s.label, count: s.items.length })),
  ];

  return (
    <>
      <Masthead
        edition={edition}
        nav={nav}
        index={index}
        storyCount={front.length + sections.reduce((n, s) => n + s.items.length, 0)}
        closingSoon={urgent.length}
      />
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
