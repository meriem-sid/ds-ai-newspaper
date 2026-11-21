import { Suspense } from "react";
import ArticleCard from "@/components/ArticleCard";
import { EmptyNote, StoryGrid } from "@/components/Section";
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
    <form action="/archive" method="get" role="search" className="mb-12 flex flex-wrap gap-2 font-sans">
      <label htmlFor="q" className="sr-only">
        Search the archive
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Search headlines, summaries, tags…"
        className="h-11 min-w-0 flex-1 rounded-md border border-rule bg-surface px-4 text-[0.95rem] text-ink placeholder:text-muted transition-colors focus:border-rule-strong/60"
      />
      <label htmlFor="category" className="sr-only">
        Section
      </label>
      <select id="category" name="category" defaultValue={category} className="h-11 rounded-md border border-rule bg-surface px-3 text-[0.9rem] text-ink">
        <option value="">All sections</option>
        {ARCHIVE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <button type="submit" className="h-11 rounded-md bg-ink px-5 text-[0.9rem] font-medium text-paper transition-opacity hover:opacity-85">
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
      <p className="mb-8 font-sans text-[0.875rem] text-muted">
        {q ? `${articles.length} result${articles.length === 1 ? "" : "s"} for “${q}”` : "Latest stories"}
      </p>
      {articles.length === 0 ? (
        <EmptyNote>No stories match. Try a broader term, or remove the section filter.</EmptyNote>
      ) : (
        <StoryGrid>
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} today={today} showEditionDate />
          ))}
        </StoryGrid>
      )}
    </>
  );
}
