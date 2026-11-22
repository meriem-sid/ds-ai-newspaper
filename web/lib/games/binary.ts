import { seededRandom, shuffle } from "./rng";

/**
 * Binary Grid (also known as Takuzu / Binairo): fill an N×N grid with 0s and 1s so that
 *   1. no three identical digits are adjacent in a row or column,
 *   2. every row and column has as many 0s as 1s,
 *   3. no two rows are identical, and no two columns are identical.
 * Cells: -1 = empty, 0, 1. Row-major.
 */
export type BinaryGrid = number[];
export const BINARY_SIZE = 8;

function line(g: BinaryGrid, n: number, idx: number, isRow: boolean): number[] {
  return Array.from({ length: n }, (_, k) => g[isRow ? idx * n + k : k * n + idx]);
}

/** Does this (possibly partial) row/column break rule 1 or 2? */
function lineBroken(cells: number[], n: number): boolean {
  let zeros = 0, ones = 0;
  for (let k = 0; k < n; k++) {
    const v = cells[k];
    if (v === 0) zeros++;
    else if (v === 1) ones++;
    if (v !== -1 && k >= 2 && cells[k - 1] === v && cells[k - 2] === v) return true;
  }
  return zeros > n / 2 || ones > n / 2;
}

/** Is a *complete* line identical to another complete line of the same kind? */
function duplicateLine(g: BinaryGrid, n: number, idx: number, isRow: boolean): boolean {
  const mine = line(g, n, idx, isRow);
  if (mine.includes(-1)) return false;
  for (let o = 0; o < n; o++) {
    if (o === idx) continue;
    const other = line(g, n, o, isRow);
    if (!other.includes(-1) && other.every((v, k) => v === mine[k])) return true;
  }
  return false;
}

function cellOk(g: BinaryGrid, n: number, i: number): boolean {
  const r = Math.floor(i / n), c = i % n;
  return (
    !lineBroken(line(g, n, r, true), n) &&
    !lineBroken(line(g, n, c, false), n) &&
    !duplicateLine(g, n, r, true) &&
    !duplicateLine(g, n, c, false)
  );
}

function search(start: BinaryGrid, n: number, limit: number, rand?: () => number): { count: number; first: BinaryGrid | null } {
  const g = start.slice();
  for (let i = 0; i < n * n; i++) if (g[i] !== -1 && !cellOk(g, n, i)) return { count: 0, first: null };
  let count = 0;
  let first: BinaryGrid | null = null;
  const empties = [...Array(n * n).keys()].filter((i) => g[i] === -1);

  const rec = (k: number): boolean => {
    if (k === empties.length) {
      count++;
      if (!first) first = g.slice();
      return count >= limit;
    }
    const i = empties[k];
    const values = rand && rand() < 0.5 ? [1, 0] : [0, 1];
    for (const v of values) {
      g[i] = v;
      if (cellOk(g, n, i) && rec(k + 1)) return true;
    }
    g[i] = -1;
    return false;
  };
  rec(0);
  return { count, first };
}

export function countBinarySolutions(grid: BinaryGrid, n = BINARY_SIZE, limit = 2): number {
  return search(grid, n, limit).count;
}

export function generateBinary(seed: string, n = BINARY_SIZE, givens = 22): { puzzle: BinaryGrid; solution: BinaryGrid } {
  const rand = seededRandom(seed);
  const solution = search(new Array(n * n).fill(-1), n, 1, rand).first!;
  const puzzle = solution.slice();
  let filled = n * n;
  for (const i of shuffle([...Array(n * n).keys()], rand)) {
    if (filled <= givens) break;
    const keep = puzzle[i];
    puzzle[i] = -1;
    if (countBinarySolutions(puzzle, n, 2) === 1) filled--;
    else puzzle[i] = keep;
  }
  return { puzzle, solution };
}

/** Cells involved in a rule break, for highlighting while playing. */
export function binaryConflicts(g: BinaryGrid, n = BINARY_SIZE): Set<number> {
  const bad = new Set<number>();
  for (let idx = 0; idx < n; idx++) {
    for (const isRow of [true, false]) {
      const cells = line(g, n, idx, isRow);
      const at = (k: number) => (isRow ? idx * n + k : k * n + idx);
      for (let k = 2; k < n; k++) {
        if (cells[k] !== -1 && cells[k] === cells[k - 1] && cells[k] === cells[k - 2]) [k, k - 1, k - 2].forEach((x) => bad.add(at(x)));
      }
      for (const v of [0, 1]) {
        if (cells.filter((x) => x === v).length > n / 2) cells.forEach((x, k) => x === v && bad.add(at(k)));
      }
      if (duplicateLine(g, n, idx, isRow)) cells.forEach((_, k) => bad.add(at(k)));
    }
  }
  return bad;
}
