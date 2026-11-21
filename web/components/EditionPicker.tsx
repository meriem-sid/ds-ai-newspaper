"use client";

import { useRouter } from "next/navigation";

/** Date picker for past editions. Dates without an edition show a "no edition" page with links to the nearest ones. */
export default function EditionPicker({ value, min, max }: { value: string; min: string | null; max: string | null }) {
  const router = useRouter();
  return (
    <label className="flex items-center">
      <span className="sr-only">Go to the edition for date</span>
      <input
        type="date"
        value={value}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(e) => e.target.value && router.push(`/edition/${e.target.value}`)}
        className="h-8 rounded-md border border-rule bg-surface px-2 font-sans text-[0.8125rem] text-text transition-colors hover:border-rule-strong/50"
      />
    </label>
  );
}
