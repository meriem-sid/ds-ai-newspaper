import { Suspense } from "react";
import ArticleCard from "@/components/ArticleCard";
import { EmptyNote } from "@/components/Section";
import { ARCHIVE_CATEGORIES, searchArchive, todayUTC } from "@/lib/data";
import { CATEGORY_LABELS } from "@/lib/format";
import PageHeader, { ListSkeleton } from "@/components/PageHeader";

export const metadata = { title: "Archive · The Data Science & AI Newspaper" };

type SearchParams = PageProps<"/archive">["searchParams"];

export default function ArchivePage({ searchParams }: PageProps<"/archive">) {
  return (
    <>
      <PageHeader title="Archive" subtitle="Search every past edition — try “kv cache”, “internship”, or “kaggle”. Use quotes for exact phrases." />
      <Suspense fallback={<SearchFormShell />}>
        <SearchForm searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** A plain GET form: works without JavaScript and keeps searches shareable as URLs. */
async function SearchForm({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return <SearchFormShell q={first(sp.q)} category={first(sp.category)} />;
}

function SearchFormShell({ q = "", category = "" }: { q?: string; category?: string }) {
  return (
    <form action="/archive" method="get" role="search" className="mb-10 flex flex-wrap gap-2 font-sans">
      <label htmlFor="q" className="sr-only">
        Search the archive
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Search headlines, summaries, tags…"
        className="min-w-0 flex-1 rounded border border-rule bg-card px-3 py-2 text-sm text-ink placeholder:text-muted"
      />
      <label htmlFor="category" className="sr-only">
        Section
      </label>
      <select id="category" name="category" defaultValue={category} className="rounded border border-rule bg-card px-2 py-2 text-sm text-ink">
        <option value="">All sections</option>
        {ARCHIVE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <button type="submit" className="kicker rounded bg-ink px-4 py-2 text-paper hover:opacity-90">
        Search
      </button>
    </form>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q);
  const articles = await searchArchive(q, first(sp.category) || undefined);
  const today = todayUTC();
  return (
    <>
      <p className="kicker mb-6 text-muted">
        {q ? `${articles.length} result${articles.length === 1 ? "" : "s"} for “${q}”` : "Latest stories"}
      </p>
      {articles.length === 0 ? (
        <EmptyNote>No stories match. Try a broader term, or remove the section filter.</EmptyNote>
      ) : (
        <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} today={today} showEditionDate />
          ))}
        </div>
      )}
    </>
  );
}
