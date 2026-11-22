"use client";

import { useSyncExternalStore } from "react";
import type { GameId } from "@/lib/games";
import PuzzleGame from "./PuzzleGame";

// "Are we in the browser yet?" — false during server rendering and hydration, true after.
// The game reads saved progress from localStorage on its first render, which must not
// happen on the server. (Same hydration nudge as lib/readerState.ts.)
const subscribe = (onChange: () => void) => {
  queueMicrotask(onChange);
  return () => {};
};
const useIsClient = () => useSyncExternalStore(subscribe, () => true, () => false);

export default function GameLoader({ game, date }: { game: GameId; date: string }) {
  if (!useIsClient()) {
    return <div aria-busy="true" aria-label="Loading puzzle" className="mx-auto aspect-square w-full max-w-[30rem] animate-pulse rounded-md bg-chip/70" />;
  }
  return <PuzzleGame game={game} date={date} />;
}
