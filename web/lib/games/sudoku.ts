import { seededRandom, shuffle } from "./rng";

/** 81 cells, row-major; 0 = empty. */
export type SudokuGrid = number[];

const ALL = 0b1111111110; // bits 1..9

const box = (i: number) => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);

function popcount(x: number): number {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
}

/**
 * Backtracking search with candidate bitmasks, always branching on the most
 * constrained cell. Counts solutions up to `limit` (2 is enough to test uniqueness).
 * With `rand`, candidates are tried in random order and the first solution is returned.
 */
function search(start: SudokuGrid, limit: number, rand?: () => number): { count: number; first: SudokuGrid | null } {
  const g = start.slice();
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const bit = 1 << v;
    const r = Math.floor(i / 9), c = i % 9, b = box(i);
    if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) return { count: 0, first: null }; // givens conflict
    rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
  }
  let count = 0;
  let first: SudokuGrid | null = null;

  const rec = (): boolean => {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(rows[Math.floor(i / 9)] | cols[i % 9] | boxes[box(i)]);
      const n = popcount(mask);
      if (n === 0) return false; // dead end
      if (n < bestCount) {
        best = i; bestMask = mask; bestCount = n;
        if (n === 1) break;
      }
    }
    if (best === -1) {
      count++;
      if (!first) first = g.slice();
      return count >= limit;
    }
    let digits: number[] = [];
    for (let v = 1; v <= 9; v++) if (bestMask & (1 << v)) digits.push(v);
    if (rand) digits = shuffle(digits, rand);
    const r = Math.floor(best / 9), c = best % 9, b = box(best);
    for (const v of digits) {
      const bit = 1 << v;
      g[best] = v; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      if (rec()) return true;
      g[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
    }
    return false;
  };
  rec();
  return { count, first };
}

export function countSolutions(grid: SudokuGrid, limit = 2): number {
  return search(grid, limit).count;
}

/**
 * The daily puzzle: a random complete grid, then cells removed in random order
 * while the puzzle keeps exactly one solution, down to `clues` givens.
 */
export function generateSudoku(seed: string, clues = 30): { puzzle: SudokuGrid; solution: SudokuGrid } {
  const rand = seededRandom(seed);
  const solution = search(new Array(81).fill(0), 1, rand).first!;
  const puzzle = solution.slice();
  let filled = 81;
  for (const i of shuffle([...Array(81).keys()], rand)) {
    if (filled <= clues) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) === 1) filled--;
    else puzzle[i] = keep; // removing it would allow a second solution
  }
  return { puzzle, solution };
}

/** Cells that clash with another cell in their row, column or box (for highlighting). */
export function sudokuConflicts(grid: SudokuGrid): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    for (let j = i + 1; j < 81; j++) {
      if (grid[j] !== grid[i]) continue;
      const sameRow = Math.floor(i / 9) === Math.floor(j / 9);
      const sameCol = i % 9 === j % 9;
      if (sameRow || sameCol || box(i) === box(j)) {
        bad.add(i);
        bad.add(j);
      }
    }
  }
  return bad;
}

export const sudokuBox = box;
