"use client";

import { useRouter } from "next/navigation";

/** Date picker for past editions. Dates without an edition show a "no edition" page with links to the nearest ones. */
export default function EditionPicker({ value, min, max }: { value: string; min: string | null; max: string | null }) {
  const router = useRouter();
  return (
    <label className="kicker flex items-center gap-2 text-muted">
      <span className="sr-only sm:not-sr-only">Edition</span>
      <input
        type="date"
        value={value}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(e) => e.target.value && router.push(`/edition/${e.target.value}`)}
        className="rounded border border-rule bg-card px-2 py-1 font-sans text-xs normal-case tracking-normal text-ink"
      />
    </label>
  );
}
