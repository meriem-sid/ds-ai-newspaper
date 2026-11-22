import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import GameLoader from "@/components/games/GameLoader";
import { longDate } from "@/lib/format";
import { GAMES, isGameId, puzzleDateUTC } from "@/lib/games";

export default function GamePage({ params }: PageProps<"/games/[game]">) {
  return (
    <Suspense fallback={<div className="pt-16" aria-busy="true" />}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: { params: PageProps<"/games/[game]">["params"] }) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  await connection(); // the puzzle depends on today's date: render per request, not at build time
  const date = puzzleDateUTC();
  const def = GAMES[game];
  return (
    <>
      <header className="mb-10 pt-12 sm:pt-16">
        <Link href="/games" className="font-sans text-[0.85rem] text-muted hover:text-ink">
          ← All games
        </Link>
        <h1 className="font-headline mt-3 text-[2.4rem] tracking-[-0.02em] text-ink sm:text-[3rem]">{def.name}</h1>
        <p className="mt-1 font-sans text-[0.95rem] text-muted">Puzzle for {longDate(date)} (UTC)</p>
      </header>
      <GameLoader game={game} date={date} />
    </>
  );
}
