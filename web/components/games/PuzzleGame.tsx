"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAMES, type GameId } from "@/lib/games";
import { binaryConflicts } from "@/lib/games/binary";
import { sudokuConflicts } from "@/lib/games/sudoku";
import BinaryBoard from "./BinaryBoard";
import Leaderboard from "./Leaderboard";
import ScoreForm from "./ScoreForm";
import SudokuBoard from "./SudokuBoard";

/**
 * One daily puzzle: board + timer + progress saved in this browser + score submission.
 * Rendered client-only (see GameLoader), so reading localStorage on first render is safe.
 */
type Saved = { cells: string; seconds: number; solved: boolean; posted: boolean };

const EMPTY = { sudoku: "0", binary: "." } as const;

function storageKey(game: GameId, date: string) {
  return `puzzle:${game}:${date}`;
}

function loadSaved(game: GameId, date: string, puzzle: string): Saved {
  try {
    const raw = localStorage.getItem(storageKey(game, date));
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      // Only trust saved cells that keep the day's givens intact.
      const givensIntact = [...puzzle].every((ch, i) => ch === EMPTY[game] || s.cells[i] === ch);
      if (typeof s.cells === "string" && s.cells.length === puzzle.length && givensIntact) return s;
    }
  } catch {
    // storage blocked or corrupted: start fresh
  }
  return { cells: puzzle, seconds: 0, solved: false, posted: false };
}

export function formatTime(total: number): string {
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function PuzzleGame({ game, date }: { game: GameId; date: string }) {
  const def = GAMES[game];
  const { puzzle, solution } = useMemo(() => def.daily(date), [def, date]);
  const [state, setState] = useState<Saved>(() => loadSaved(game, date, puzzle));
  const [selected, setSelected] = useState<number | null>(null);
  const [boardVersion, setBoardVersion] = useState(0); // bump to refresh the leaderboard

  // Persist every change (cells, time, solved/posted flags).
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(game, date), JSON.stringify(state));
    } catch {
      // storage blocked: the game still works for this page view
    }
  }, [game, date, state]);

  // Timer: runs while unsolved and the tab is visible (a hidden tab doesn't count against you).
  const visibleRef = useRef(true);
  useEffect(() => {
    if (state.solved) return;
    const onVis = () => (visibleRef.current = document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => {
      if (visibleRef.current) setState((s) => (s.solved ? s : { ...s, seconds: s.seconds + 1 }));
    }, 1000);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [state.solved]);

  const conflicts = useMemo(() => {
    const cells = [...state.cells];
    return game === "sudoku"
      ? sudokuConflicts(cells.map(Number))
      : binaryConflicts(cells.map((c) => (c === "." ? -1 : Number(c))));
  }, [game, state.cells]);

  const setCell = useCallback(
    (i: number, value: string) => {
      if (puzzle[i] !== EMPTY[game]) return; // givens are locked
      setState((s) => {
        if (s.solved) return s;
        const cells = s.cells.slice(0, i) + value + s.cells.slice(i + 1);
        return { ...s, cells, solved: cells === solution };
      });
    },
    [game, puzzle, solution],
  );

  const clearAll = () => setState((s) => (s.solved ? s : { ...s, cells: puzzle }));
  const filled = [...state.cells].filter((c) => c !== EMPTY[game]).length;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label={`${def.name} board`}>
        <div className="mb-4 flex items-center justify-between font-sans text-[0.875rem]">
          <span className="tabular-nums text-muted" aria-live="off">
            ⏱ <span className="font-semibold text-ink">{formatTime(state.seconds)}</span>
          </span>
          <span className="text-muted">
            {filled}/{puzzle.length} filled
            {!state.solved && filled > [...puzzle].filter((c) => c !== EMPTY[game]).length && (
              <>
                {" · "}
                <button type="button" onClick={clearAll} className="underline decoration-rule underline-offset-2 hover:text-ink">
                  Clear my entries
                </button>
              </>
            )}
          </span>
        </div>

        {game === "sudoku" ? (
          <SudokuBoard puzzle={puzzle} cells={state.cells} conflicts={conflicts} selected={selected} onSelect={setSelected} onSet={setCell} locked={state.solved} />
        ) : (
          <BinaryBoard puzzle={puzzle} cells={state.cells} conflicts={conflicts} selected={selected} onSelect={setSelected} onSet={setCell} locked={state.solved} />
        )}

        {state.solved && (
          <div role="status" className="mt-6 rounded-lg border border-rule bg-callout px-5 py-4">
            <p className="font-headline text-[1.3rem] text-ink">Solved in {formatTime(state.seconds)} 🎉</p>
            {state.posted ? (
              <p className="mt-1 font-sans text-[0.875rem] text-muted">Your time is on today&apos;s leaderboard.</p>
            ) : (
              <ScoreForm
                game={game}
                date={date}
                solution={state.cells}
                seconds={state.seconds}
                minSeconds={def.minSeconds}
                onPosted={() => {
                  setState((s) => ({ ...s, posted: true }));
                  setBoardVersion((v) => v + 1);
                }}
              />
            )}
          </div>
        )}
      </section>

      <aside aria-label="Leaderboard and rules" className="space-y-10">
        <Leaderboard game={game} date={date} version={boardVersion} />
        <div>
          <h2 className="font-headline text-[1.2rem] text-ink">How to play</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.98rem] leading-relaxed text-text">
            {def.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-3 font-sans text-[0.8rem] text-muted">
            {game === "sudoku"
              ? "Click a cell, then type 1–9 or use the buttons. Arrow keys move; Backspace clears."
              : "Click a cell to cycle 0 → 1 → empty, or type 0 / 1. Arrow keys move; Backspace clears."}{" "}
            Progress is saved in this browser.
          </p>
        </div>
      </aside>
    </div>
  );
}
