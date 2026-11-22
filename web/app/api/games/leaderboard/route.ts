import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { isGameId } from "@/lib/games";
import { visitorHash } from "@/lib/games/server";

/** GET /api/games/leaderboard?game=sudoku&date=YYYY-MM-DD — top 20, plus the caller's own entry. */
export async function GET(request: NextRequest) {
  const game = request.nextUrl.searchParams.get("game") ?? "";
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!isGameId(game) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Unknown game or date." }, { status: 400 });
  }
  const db = sql();
  const top = await db<{ rank: number; nickname: string; seconds: number }[]>`
    SELECT RANK() OVER (ORDER BY seconds)::int AS rank, nickname, seconds
    FROM game_scores WHERE game = ${game} AND puzzle_date = ${date}
    ORDER BY seconds, created_at LIMIT 20`;
  const mine = await db<{ rank: number; nickname: string; seconds: number }[]>`
    SELECT (SELECT COUNT(*)::int + 1 FROM game_scores o
            WHERE o.game = s.game AND o.puzzle_date = s.puzzle_date AND o.seconds < s.seconds) AS rank,
           nickname, seconds
    FROM game_scores s WHERE game = ${game} AND puzzle_date = ${date} AND ip_hash = ${visitorHash(request)}`;
  const [{ total }] = await db<{ total: number }[]>`
    SELECT COUNT(*)::int AS total FROM game_scores WHERE game = ${game} AND puzzle_date = ${date}`;
  return NextResponse.json({ top, you: mine[0] ?? null, total }, { headers: { "Cache-Control": "no-store" } });
}
