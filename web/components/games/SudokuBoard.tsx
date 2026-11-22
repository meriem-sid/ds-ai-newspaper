"use client";

import { useRef } from "react";

type Props = {
  puzzle: string;
  cells: string;
  conflicts: Set<number>;
  selected: number | null;
  onSelect: (i: number) => void;
  onSet: (i: number, value: string) => void;
  locked: boolean;
};

const N = 9;

export default function SudokuBoard({ puzzle, cells, conflicts, selected, onSelect, onSet, locked }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focus = (i: number) => {
    onSelect(i);
    refs.current[i]?.focus();
  };
  const selectedValue = selected !== null && cells[selected] !== "0" ? cells[selected] : null;

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
      focus(moves[e.key]);
    } else if (/^[1-9]$/.test(e.key)) {
      onSet(i, e.key);
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      onSet(i, "0");
    }
  };

  return (
    <div>
      <div
        role="grid"
        aria-label="Sudoku grid"
        className="mx-auto grid w-full max-w-[30rem] grid-cols-9 overflow-hidden rounded-md border-2 border-rule-strong"
      >
        {[...cells].map((v, i) => {
          const r = Math.floor(i / N), c = i % N;
          const given = puzzle[i] !== "0";
          const isSel = selected === i;
          const peer = selected !== null && (Math.floor(selected / N) === r || selected % N === c);
          const same = selectedValue !== null && v === selectedValue;
          const bad = conflicts.has(i);
          return (
            <button
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="gridcell"
              aria-label={`Row ${r + 1}, column ${c + 1}: ${v === "0" ? "empty" : v}${given ? " (given)" : ""}`}
              aria-selected={isSel}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={[
                "flex aspect-square items-center justify-center font-sans text-[clamp(1rem,4.6vw,1.55rem)] tabular-nums transition-colors",
                c % 3 === 2 && c !== 8 ? "border-r-2 border-r-rule-strong" : c !== 8 ? "border-r border-r-rule" : "",
                r % 3 === 2 && r !== 8 ? "border-b-2 border-b-rule-strong" : r !== 8 ? "border-b border-b-rule" : "",
                isSel ? "bg-link/20" : same ? "bg-link/10" : peer ? "bg-chip/70" : "bg-surface",
                bad ? "text-accent" : given ? "font-semibold text-ink" : "font-medium text-link",
                locked ? "cursor-default" : "cursor-pointer",
              ].join(" ")}
            >
              {v === "0" ? "" : v}
            </button>
          );
        })}
      </div>

      {/* On-screen number pad (phones have no keyboard for a grid of buttons). */}
      {!locked && (
        <div className="mx-auto mt-4 grid max-w-[30rem] grid-cols-10 gap-1.5" aria-label="Number pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              disabled={selected === null}
              onClick={() => selected !== null && onSet(selected, d)}
              className="aspect-square rounded-md border border-rule bg-surface font-sans text-[1.05rem] font-medium text-ink transition-colors hover:bg-chip disabled:opacity-40"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            aria-label="Clear cell"
            disabled={selected === null}
            onClick={() => selected !== null && onSet(selected, "0")}
            className="aspect-square rounded-md border border-rule bg-surface font-sans text-[0.9rem] text-muted transition-colors hover:bg-chip disabled:opacity-40"
          >
            ⌫
          </button>
        </div>
      )}
    </div>
  );
}
