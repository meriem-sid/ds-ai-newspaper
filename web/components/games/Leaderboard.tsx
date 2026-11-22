"use client";

import { useEffect, useState } from "react";
import type { GameId } from "@/lib/games";

type Row = { rank: number; nickname: string; seconds: number };
type Data = { top: Row[]; you: Row | null; total: number };

function fmt(total: number) {
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Today's top 20 for one puzzle; refetches when `version` changes (after posting a time). */
export default function Leaderboard({ game, date, version }: { game: GameId; date: string; version: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/games/leaderboard?game=${game}&date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Data) => {
        if (!cancelled) {
          setData(d);
          setFailed(false);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [game, date, version]);

  const youInTop = data?.you && data.top.some((r) => r.rank === data.you!.rank && r.nickname === data.you!.nickname);

  return (
    <section aria-labelledby="leaderboard-heading">
      <h2 id="leaderboard-heading" className="font-headline text-[1.2rem] text-ink">
        Today&apos;s leaderboard
      </h2>
      {failed ? (
        <p className="mt-3 font-sans text-[0.875rem] text-muted">Couldn&apos;t load the leaderboard.</p>
      ) : !data ? (
        <p className="mt-3 font-sans text-[0.875rem] text-muted">Loading…</p>
      ) : data.top.length === 0 ? (
        <p className="mt-3 font-sans text-[0.875rem] text-muted">No times yet. Be the first to solve it.</p>
      ) : (
        <ol className="mt-3 divide-y divide-rule border-y border-rule font-sans text-[0.9rem]">
          {data.top.map((r, i) => {
            const isYou = data.you && r.rank === data.you.rank && r.nickname === data.you.nickname;
            return (
              <li key={`${r.rank}-${r.nickname}-${i}`} className={`flex items-center gap-3 py-2 ${isYou ? "font-semibold text-ink" : "text-text"}`}>
                <span className="w-6 text-right tabular-nums text-muted">{r.rank}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.nickname}
                  {isYou && <span className="ml-1.5 text-[0.75rem] font-normal text-muted">(you)</span>}
                </span>
                <span className="tabular-nums">{fmt(r.seconds)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {data?.you && !youInTop && (
        <p className="mt-2 font-sans text-[0.85rem] text-muted">
          You: #{data.you.rank} · {fmt(data.you.seconds)}
        </p>
      )}
      {data && data.total > 0 && (
        <p className="mt-2 font-sans text-[0.75rem] text-muted">
          {data.total} solver{data.total === 1 ? "" : "s"} today · one entry per visitor
        </p>
      )}
    </section>
  );
}
