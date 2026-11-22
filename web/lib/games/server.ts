import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { GAMES, MAX_SECONDS, isGameId, puzzleDateUTC, type GameId } from "./index";

/**
 * A stable, non-reversible visitor id: SHA-256 of (salt + IP). The raw IP is never
 * stored. Vercel sets x-forwarded-for / x-real-ip; locally there is no proxy.
 */
export function visitorHash(request: NextRequest): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local";
  const salt = process.env.RATE_LIMIT_SALT || "dev-only-salt-set-RATE_LIMIT_SALT-in-production";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

const NICKNAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,19}$/u;

export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const nick = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  return NICKNAME.test(nick) ? nick : null;
}

/** Today's and yesterday's puzzles count (someone may start just before midnight UTC). */
export function acceptableDate(date: unknown): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = puzzleDateUTC();
  const yesterday = puzzleDateUTC(new Date(Date.now() - 86_400_000));
  return date === today || date === yesterday;
}

export type Submission = { game: GameId; date: string; nickname: string; seconds: number };

/** Validate a score: real game, recent date, a correct solution, a plausible time, a clean nickname. */
export function validateSubmission(body: unknown): { ok: true; value: Submission } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  const b = body as Record<string, unknown>;
  if (typeof b.game !== "string" || !isGameId(b.game)) return { ok: false, error: "Unknown game." };
  const game = GAMES[b.game];
  if (!acceptableDate(b.date)) return { ok: false, error: "That puzzle is no longer open for the leaderboard." };
  if (typeof b.solution !== "string" || b.solution !== game.daily(b.date).solution) {
    return { ok: false, error: "That grid isn't the solution." };
  }
  const seconds = Number(b.seconds);
  if (!Number.isInteger(seconds) || seconds < game.minSeconds || seconds > MAX_SECONDS) {
    return { ok: false, error: `Times must be between ${game.minSeconds}s and ${MAX_SECONDS / 3600}h.` };
  }
  const nickname = cleanNickname(b.nickname);
  if (!nickname) return { ok: false, error: "Nicknames are 2–20 letters, digits, spaces, dots, dashes or underscores." };
  return { ok: true, value: { game: b.game, date: b.date, nickname, seconds } };
}
