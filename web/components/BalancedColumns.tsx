"use client";

import { Children, isValidElement, useEffect, useRef, useState } from "react";

/** Minimum leftover height (px) in the shortest column before a pull quote fills it. */
const FILL_GAP = 220;
/** Pull quotes only in sections with this many stories: in a small section, a quote just repeats its neighbour. */
const FILL_MIN_STORIES = 5;

export type PullQuoteCandidate = { key: string; node: React.ReactNode };

const plainKey = (k: React.Key | null) => String(k ?? "").replace(/^\.\$/, ""); // Children.toArray prefixes keys with ".$"

/**
 * Newspaper columns that end level. Stories stay whole and are placed one by one into
 * whichever column is currently shortest (best stories first, so they sit at the top).
 *
 * - The column count never exceeds the number of stories: 1 story is set full-width at a
 *   reading measure, 2 stories use 2 columns. (Otherwise a lone story sits next to empty columns.)
 * - If one column still ends well short in a big section, it gets a pull quote taken from a
 *   story in a *different* column, so the quote never sits beside its own source text.
 * - Before the first measurement (server render, hydration) the stories render as CSS columns.
 *   Column breakpoints match that fallback: 1 below md, 2 below xl, else `cols`.
 */
export default function BalancedColumns({
  children,
  cols = 3,
  pullQuotes = [],
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
  /** In preference order; keys are the stories' React keys. */
  pullQuotes?: PullQuoteCandidate[];
}) {
  const items = Children.toArray(children);
  const keys = items.map((c) => (isValidElement(c) ? plainKey(c.key) : ""));
  const signature = keys.join("|"); // identity of the current set of stories
  // Never more columns than stories; and 4 stories sit 2 + 2 (3 columns would split them 2/1/1).
  const maxCols = items.length === 4 ? Math.min(cols, 2) : Math.min(cols, items.length);
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ signature: string; columns: number[][]; fill: { column: number; node: React.ReactNode } | null } | null>(null);
  // A placement only applies to the exact set of stories it was measured for.
  const current = placed && placed.signature === signature ? placed : null;

  useEffect(() => {
    const el = ref.current;
    if (!el || maxCols < 2) return;
    let lastWidth = -1;
    const compute = () => {
      const width = el.clientWidth;
      if (width === lastWidth) return; // height changes from our own re-layout don't matter
      lastWidth = width;
      const n = Math.min(maxCols, window.innerWidth >= 1280 ? cols : window.innerWidth >= 768 ? 2 : 1);
      if (n < 2) return setPlaced(null);
      // Every story renders at the column width in both layouts, so its height can be
      // measured from whichever layout is on screen now.
      const heights = items.map((_, i) => el.querySelector<HTMLElement>(`[data-col-item="${i}"]`)?.offsetHeight ?? 0);
      const columns: number[][] = Array.from({ length: n }, () => []);
      const totals = new Array(n).fill(0);
      heights.forEach((h, i) => {
        const shortest = totals.indexOf(Math.min(...totals));
        columns[shortest].push(i);
        totals[shortest] += h;
      });
      let fill: { column: number; node: React.ReactNode } | null = null;
      if (items.length >= FILL_MIN_STORIES && Math.max(...totals) - Math.min(...totals) >= FILL_GAP) {
        const column = totals.indexOf(Math.min(...totals));
        const inColumn = new Set(columns[column].map((i) => keys[i]));
        const quote = pullQuotes.find((q) => !inColumn.has(q.key));
        if (quote) fill = { column, node: quote.node };
      }
      setPlaced({ signature, columns, fill });
    };
    // ResizeObserver reports once right away (before paint), then on every resize.
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
    // signature: re-balance when the set of stories changes (e.g. switching job tabs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, signature]);

  const wrap = (i: number) => (
    <div key={keys[i] || i} data-col-item={i} className="np-story">
      {items[i]}
    </div>
  );

  if (maxCols < 2) {
    // One story: full width, but at a comfortable reading measure rather than edge to edge.
    return (
      <div ref={ref} className="max-w-3xl">
        {items.map((_, i) => wrap(i))}
      </div>
    );
  }
  if (!current) {
    return (
      <div ref={ref} className={`np-columns columns-1 md:columns-2 ${maxCols === 3 ? "xl:columns-3" : ""}`}>
        {items.map((_, i) => wrap(i))}
      </div>
    );
  }
  return (
    <div ref={ref} className="np-balanced flex">
      {current.columns.map((column, c) => (
        <div key={c} className="np-col min-w-0 flex-1">
          {column.map((i) => wrap(i))}
          {current.fill?.column === c && current.fill.node}
        </div>
      ))}
    </div>
  );
}
