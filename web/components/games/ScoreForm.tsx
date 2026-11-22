"use client";

import { useState } from "react";
import type { GameId } from "@/lib/games";

const NICK_KEY = "puzzle:nickname";

function savedNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function ScoreForm(props: {
  game: GameId;
  date: string;
  solution: string;
  seconds: number;
  minSeconds: number;
  onPosted: () => void;
}) {
  const [nickname, setNickname] = useState(savedNickname);
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "error" | "done"; message?: string }>({ kind: "idle" });

  if (props.seconds < props.minSeconds) {
    return (
      <p className="mt-1 font-sans text-[0.875rem] text-muted">
        Impressively fast, but leaderboard times start at {props.minSeconds}s.
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      localStorage.setItem(NICK_KEY, nickname.trim());
    } catch {
      // fine: just not remembered
    }
    try {
      const res = await fetch("/api/games/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: props.game, date: props.date, solution: props.solution, seconds: props.seconds, nickname }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({ kind: "done", message: `You're #${data.rank} today.` });
        props.onPosted();
      } else if (res.status === 409) {
        setStatus({ kind: "done", message: data.error });
        props.onPosted();
      } else {
        setStatus({ kind: "error", message: data.error ?? "Couldn't post your time. Try again." });
      }
    } catch {
      setStatus({ kind: "error", message: "Network error. Try again." });
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2 font-sans">
      <label htmlFor="nickname" className="text-[0.875rem] text-text">
        Post your time as
      </label>
      <input
        id="nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        required
        minLength={2}
        maxLength={20}
        pattern="[\p{L}\p{N}][\p{L}\p{N} ._\-]{1,19}"
        placeholder="nickname"
        autoComplete="nickname"
        className="h-9 w-40 rounded-md border border-rule bg-surface px-3 text-[0.9rem] text-ink"
      />
      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="h-9 rounded-md bg-ink px-4 text-[0.875rem] font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {status.kind === "sending" ? "Posting…" : "Post"}
      </button>
      {status.message && (
        <p role="status" className={`w-full text-[0.85rem] ${status.kind === "error" ? "text-accent" : "text-muted"}`}>
          {status.message}
        </p>
      )}
    </form>
  );
}
