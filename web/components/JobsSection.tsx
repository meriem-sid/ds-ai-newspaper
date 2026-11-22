"use client";

import { useState } from "react";
import type { Article } from "@/lib/data";
import JobCard from "./JobCard";
import PullQuote from "./PullQuote";
import { EmptyNote, StoryGrid } from "./Section";

// Internships sit under Entry Level (with their own badge on the card).
const TABS = [
  { key: "all", label: "All", test: () => true },
  { key: "entry", label: "Entry Level", test: (a: Article) => a.job_level === "entry" || a.job_level === "internship" },
  { key: "mid", label: "Mid Level", test: (a: Article) => a.job_level === "mid" },
  { key: "senior", label: "Senior", test: (a: Article) => a.job_level === "senior" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const LEVEL_ORDER: Record<string, number> = { internship: 0, entry: 1, mid: 2, senior: 3 };

export default function JobsSection({ jobs, today }: { jobs: Article[]; today: string }) {
  const [tab, setTab] = useState<TabKey>("all");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const pool = remoteOnly ? jobs.filter((j) => j.is_remote) : jobs;
  const active = TABS.find((t) => t.key === tab)!;
  const shown = pool
    .filter(active.test)
    .sort((a, b) => (LEVEL_ORDER[a.job_level ?? ""] ?? 9) - (LEVEL_ORDER[b.job_level ?? ""] ?? 9) || (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        {/* Real tabs: arrow keys aren't needed for 4 buttons, but roles/aria-selected tell screen readers what this is. */}
        <div role="tablist" aria-label="Seniority" className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const n = pool.filter(t.test).length;
            const selected = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="jobs-panel"
                onClick={() => setTab(t.key)}
                className={`rounded-full border px-3.5 py-1.5 font-sans text-[0.8125rem] font-medium transition-colors ${
                  selected ? "border-ink bg-ink text-paper" : "border-rule text-muted hover:border-rule-strong/60 hover:text-ink"
                }`}
              >
                {t.label} <span className="ml-1 tabular-nums opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="flex cursor-pointer items-center gap-2 font-sans text-[0.8125rem] text-muted">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" />
          Remote only
        </label>
      </div>

      <div id="jobs-panel" role="tabpanel" aria-label={`${active.label} jobs`}>
        {shown.length === 0 ? (
          <EmptyNote>No {tab === "all" ? "" : `${active.label.toLowerCase()} `}roles{remoteOnly ? " marked remote" : ""} in this edition.</EmptyNote>
        ) : (
          <StoryGrid filler={shown[0]?.why_it_matters ? <PullQuote text={shown[0].why_it_matters} source={`${shown[0].title}${shown[0].company ? ` · ${shown[0].company}` : ""}`} /> : undefined}>
            {shown.map((j) => (
              <JobCard key={j.id} job={j} today={today} />
            ))}
          </StoryGrid>
        )}
      </div>
    </>
  );
}
