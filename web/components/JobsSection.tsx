"use client";

import { useState } from "react";
import type { Article } from "@/lib/data";
import ArticleCard from "./ArticleCard";
import { EmptyNote } from "./Section";

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "remote", label: "Remote", test: (a: Article) => a.is_remote === true },
  { key: "internship", label: "Internship", test: (a: Article) => a.job_level === "internship" },
  { key: "junior", label: "Junior / Entry", test: (a: Article) => a.job_level === "junior" || a.job_level === "entry" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function JobFilters({ value, onChange, jobs }: { value: FilterKey; onChange: (k: FilterKey) => void; jobs: Article[] }) {
  return (
    <div role="group" aria-label="Filter jobs" className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => {
        const n = jobs.filter(f.test).length;
        const active = value === f.key;
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f.key)}
            className={`kicker rounded-full border px-3 py-1 transition-colors ${
              active ? "border-rule-strong bg-ink text-paper" : "border-rule text-muted hover:border-rule-strong hover:text-ink"
            }`}
          >
            {f.label} <span className="opacity-60">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function JobsSection({ jobs, today }: { jobs: Article[]; today: string }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const shown = jobs.filter(FILTERS.find((f) => f.key === filter)!.test);
  return (
    <>
      <div className="mb-5">
        <JobFilters value={filter} onChange={setFilter} jobs={jobs} />
      </div>
      {shown.length === 0 ? (
        <EmptyNote>No jobs match this filter in this edition.</EmptyNote>
      ) : (
        <div className="grid gap-x-8 gap-y-8 md:grid-cols-2">
          {shown.map((a) => (
            <ArticleCard key={a.id} article={a} today={today} />
          ))}
        </div>
      )}
    </>
  );
}
