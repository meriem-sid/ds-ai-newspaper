import { BINARY_SIZE, generateBinary } from "./binary";
import { generateSudoku } from "./sudoku";

/**
 * Game registry shared by the browser (to play) and the server (to verify scores).
 * Puzzles and solutions travel as plain strings:
 *   sudoku: 81 chars "0"-"9" (0 = empty)      binary: 64 chars "0", "1" or "." (empty)
 */
export type GameId = "sudoku" | "binary";

export type GameDef = {
  id: GameId;
  name: string;
  blurb: string;
  rules: string[];
  /** Fastest plausible human solve; faster submissions are rejected. */
  minSeconds: number;
  daily: (date: string) => { puzzle: string; solution: string };
};

export const MAX_SECONDS = 4 * 60 * 60;

export const GAMES: Record<GameId, GameDef> = {
  sudoku: {
    id: "sudoku",
    name: "Sudoku",
    blurb: "The classic 9×9 number puzzle. One new grid every day.",
    rules: [
      "Fill every empty cell with a digit from 1 to 9.",
      "Each row, each column and each 3×3 box must contain every digit exactly once.",
      "Clashing digits turn red. There is exactly one solution.",
    ],
    minSeconds: 45,
    daily: (date) => {
      const { puzzle, solution } = generateSudoku(`sudoku:${date}`);
      return { puzzle: puzzle.join(""), solution: solution.join("") };
    },
  },
  binary: {
    id: "binary",
    name: "Binary Grid",
    blurb: "A quick 8×8 logic puzzle of 0s and 1s.",
    rules: [
      "Fill every cell with a 0 or a 1.",
      "No more than two of the same digit next to each other in a row or column.",
      "Each row and column has four 0s and four 1s.",
      "No two rows are the same, and no two columns are the same.",
    ],
    minSeconds: 20,
    daily: (date) => {
      const { puzzle, solution } = generateBinary(`binary:${date}`, BINARY_SIZE);
      const enc = (g: number[]) => g.map((v) => (v === -1 ? "." : String(v))).join("");
      return { puzzle: enc(puzzle), solution: enc(solution) };
    },
  },
};

export function isGameId(x: string): x is GameId {
  return x === "sudoku" || x === "binary";
}

/** Today's puzzle date (UTC), so everyone worldwide plays the same grid on the same day. */
export function puzzleDateUTC(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
