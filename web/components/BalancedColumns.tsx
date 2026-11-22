"use client";

import { Children, isValidElement, useEffect, useRef, useState } from "react";

/**
 * Newspaper columns that end level. Stories stay whole and are placed one by one into
 * whichever column is currently shortest (best stories first, so they sit at the top).
 *
 * Before the first measurement — on the server and during hydration — the same stories
 * render as plain CSS columns, so the page never waits on JavaScript to show content.
 * Column count follows the same breakpoints as the fallback: 1 below md, 2 below xl, else `cols`.
 */
/** Minimum leftover height (px) in the shortest column before a pull quote fills it. */
const FILL_GAP = 220;

export default function BalancedColumns({
  children,
  cols = 3,
  filler,
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
  /** Optional newspaper filler (e.g. a pull quote) for a column that ends well short of the others. */
  filler?: React.ReactNode;
}) {
  const items = Children.toArray(children);
  // Identity of the current set of stories (React keys), so a different set re-balances.
  const signature = items.map((c) => (isValidElement(c) ? String(c.key) : "")).join("|");
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ signature: string; columns: number[][]; fillColumn: number | null } | null>(null);
  // A placement only applies to the exact set of stories it was measured for.
  const layout = placed && placed.signature === signature ? placed.columns : null;
  const fillColumn = layout ? placed!.fillColumn : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastWidth = -1;
    const compute = () => {
      const width = el.clientWidth;
      if (width === lastWidth) return; // height changes from our own re-layout don't matter
      lastWidth = width;
      const n = window.innerWidth >= 1280 ? cols : window.innerWidth >= 768 ? 2 : 1;
      if (n === 1) return setPlaced(null);
      // Every story renders at the column width in both layouts, so its height can be
      // measured from whichever layout is on screen now.
      const heights = items.map((_, i) => (el.querySelector<HTMLElement>(`[data-col-item="${i}"]`)?.offsetHeight ?? 0));
      const columns: number[][] = Array.from({ length: n }, () => []);
      const totals = new Array(n).fill(0);
      heights.forEach((h, i) => {
        const shortest = totals.indexOf(Math.min(...totals));
        columns[shortest].push(i);
        totals[shortest] += h;
      });
      const gap = Math.max(...totals) - Math.min(...totals);
      setPlaced({ signature, columns, fillColumn: filler && gap >= FILL_GAP ? totals.indexOf(Math.min(...totals)) : null });
    };
    // ResizeObserver reports once right away (before paint), then on every resize.
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
    // signature: re-balance when the set of stories changes (e.g. switching job tabs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, signature]);

  const wrap = (i: number) => (
    <div key={i} data-col-item={i} className="np-story">
      {items[i]}
    </div>
  );

  if (!layout) {
    return (
      <div ref={ref} className={`np-columns columns-1 md:columns-2 ${cols === 3 ? "xl:columns-3" : ""}`}>
        {items.map((_, i) => wrap(i))}
      </div>
    );
  }
  return (
    <div ref={ref} className="np-balanced flex">
      {layout.map((column, c) => (
        <div key={c} className="np-col min-w-0 flex-1">
          {column.map((i) => wrap(i))}
          {c === fillColumn && filler}
        </div>
      ))}
    </div>
  );
}
