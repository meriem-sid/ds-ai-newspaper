"use client";

import { useRef } from "react";
import { BINARY_SIZE as N } from "@/lib/games/binary";

type Props = {
  puzzle: string;
  cells: string;
  conflicts: Set<number>;
  selected: number | null;
  onSelect: (i: number) => void;
  onSet: (i: number, value: string) => void;
  locked: boolean;
};

const NEXT: Record<string, string> = { ".": "0", "0": "1", "1": "." }; // click cycles empty → 0 → 1 → empty

export default function BinaryBoard({ puzzle, cells, conflicts, selected, onSelect, onSet, locked }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const r = Math.floor(i / N), c = i % N;
    const moves: Record<string, number> = {
      ArrowUp: ((r + N - 1) % N) * N + c,
      ArrowDown: ((r + 1) % N) * N + c,
      ArrowLeft: r * N + ((c + N - 1) % N),
      ArrowRight: r * N + ((c + 1) % N),
    };
    if (e.key in moves) {
      e.preventDefault();
      onSelect(moves[e.key]);
      refs.current[moves[e.key]]?.focus();
    } else if (e.key === "0" || e.key === "1") {
      onSet(i, e.key);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      onSet(i, ".");
    }
  };

  return (
    <div
      role="grid"
      aria-label="Binary grid"
      className="mx-auto grid w-full max-w-[26rem] grid-cols-8 gap-1.5 rounded-md border-2 border-rule-strong bg-rule/40 p-1.5"
    >
      {[...cells].map((v, i) => {
        const r = Math.floor(i / N), c = i % N;
        const given = puzzle[i] !== ".";
        const bad = conflicts.has(i);
        return (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="gridcell"
            aria-label={`Row ${r + 1}, column ${c + 1}: ${v === "." ? "empty" : v}${given ? " (given)" : ""}`}
            aria-selected={selected === i}
            onClick={() => {
              onSelect(i);
              if (!given && !locked) onSet(i, NEXT[v]);
            }}
            onKeyDown={(e) => onKey(e, i)}
            className={[
              "flex aspect-square items-center justify-center rounded font-sans text-[clamp(1.05rem,5vw,1.6rem)] tabular-nums transition-colors",
              selected === i ? "ring-2 ring-link" : "",
              bad ? "bg-accent-soft text-accent" : given ? "bg-chip font-semibold text-ink" : v === "." ? "bg-surface" : "bg-surface font-medium text-link",
              locked || given ? "cursor-default" : "cursor-pointer",
            ].join(" ")}
          >
            {v === "." ? "" : v}
          </button>
        );
      })}
    </div>
  );
}
