"use client";

import { useEffect, useState } from "react";
import type { Article } from "@/lib/data";
import { CATEGORY_LABELS } from "@/lib/format";
import { useReaderState } from "@/lib/readerState";
import ArticleCard from "./ArticleCard";
import { ListSkeleton } from "./PageHeader";
import { EmptyNote, StoryGrid } from "./Section";

type Loaded = { key: string; articles: Article[] } | { key: string; error: true };

/** Bookmarks live in this browser; the story text comes from the API by id. */
export default function SavedList() {
  const state = useReaderState();
  const savedKey = state ? [...state.saved].sort((a, b) => a - b).join(",") : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!savedKey) return; // not hydrated yet, or nothing saved
    let cancelled = false;
    fetch(`/api/articles?ids=${savedKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { articles: Article[] }) => !cancelled && setLoaded({ key: savedKey, articles: data.articles }))
      .catch(() => !cancelled && setLoaded({ key: savedKey, error: true }));
    return () => {
      cancelled = true;
    };
  }, [savedKey]);

  if (state === null) return <ListSkeleton />;
  if (!savedKey) {
    return <EmptyNote>Nothing saved yet. Use the bookmark icon on any story; saved stories stay in this browser.</EmptyNote>;
  }
  if (!loaded) return <ListSkeleton />;
  if ("error" in loaded) {
    return loaded.key === savedKey ? (
      <EmptyNote>Couldn&apos;t load your saved stories. Check your connection and refresh.</EmptyNote>
    ) : (
      <ListSkeleton />
    );
  }

  // While a refetch runs, keep the previous list (filtered to what's still saved) so the page doesn't flash.
  const savedIds = new Set(state.saved);
  const articles = loaded.articles.filter((a) => savedIds.has(a.id));
  if (articles.length === 0) return <EmptyNote>Nothing saved yet. Use the bookmark icon on any story.</EmptyNote>;

  const today = new Date().toISOString().slice(0, 10);
  const groups = Object.entries(CATEGORY_LABELS)
    .map(([cat, label]) => ({ label, items: articles.filter((a) => a.category === cat) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-16">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-8 border-t-2 border-rule-strong pt-3 font-serif text-[1.6rem] font-semibold text-ink">
            {g.label} <span className="ml-2 align-middle font-sans text-[0.8125rem] font-medium text-muted">{g.items.length}</span>
          </h2>
          <StoryGrid>
            {g.items.map((a) => (
              <ArticleCard key={a.id} article={a} today={today} showEditionDate />
            ))}
          </StoryGrid>
        </section>
      ))}
    </div>
  );
}
