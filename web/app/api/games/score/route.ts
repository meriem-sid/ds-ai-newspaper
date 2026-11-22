import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { validateSubmission, visitorHash } from "@/lib/games/server";

/**
 * POST /api/games/score  { game, date, solution, seconds, nickname }
 * The server regenerates the day's puzzle and only accepts the correct solution.
 * One entry per visitor per puzzle per day (first solve counts).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 2000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const check = validateSubmission(body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });
  const { game, date, nickname, seconds } = check.value;

  const db = sql();
  const inserted = await db`
    INSERT INTO game_scores (game, puzzle_date, nickname, seconds, ip_hash)
    VALUES (${game}, ${date}, ${nickname}, ${seconds}, ${visitorHash(request)})
    ON CONFLICT (game, puzzle_date, ip_hash) DO NOTHING
    RETURNING id`;
  if (inserted.length === 0) {
    return NextResponse.json({ error: "You've already posted a time for today's puzzle." }, { status: 409 });
  }
  const [{ rank }] = await db<{ rank: number }[]>`
    SELECT COUNT(*)::int + 1 AS rank FROM game_scores
    WHERE game = ${game} AND puzzle_date = ${date} AND seconds < ${seconds}`;
  return NextResponse.json({ ok: true, rank }, { status: 201 });
}
