import { Suspense } from "react";
import ArticleCard from "@/components/ArticleCard";
import { EmptyNote } from "@/components/Section";
import { getSaved, todayUTC } from "@/lib/data";
import { CATEGORY_LABELS } from "@/lib/format";
import PageHeader, { ListSkeleton } from "@/components/PageHeader";

export const metadata = { title: "Saved · The Data Science & AI Newspaper" };

export default function SavedPage() {
  return (
    <>
      <PageHeader title="Saved" subtitle="Everything you bookmarked, newest edition first." />
      <Suspense fallback={<ListSkeleton />}>
        <SavedList />
      </Suspense>
    </>
  );
}

async function SavedList() {
  const [articles, today] = [await getSaved(), todayUTC()];
  if (articles.length === 0) return <EmptyNote>Nothing saved yet. Use the bookmark icon on any story.</EmptyNote>;
  // Group by section so jobs and hackathons don't get lost among papers.
  const groups = Object.entries(CATEGORY_LABELS)
    .map(([cat, label]) => ({ label, items: articles.filter((a) => a.category === cat) }))
    .filter((g) => g.items.length);
  return (
    <div className="space-y-12">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-5 border-b-2 border-rule-strong pb-1.5 font-serif text-2xl font-bold">
            {g.label} <span className="kicker align-middle text-muted">{g.items.length}</span>
          </h2>
          <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {g.items.map((a) => (
              <ArticleCard key={a.id} article={a} today={today} showEditionDate />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
