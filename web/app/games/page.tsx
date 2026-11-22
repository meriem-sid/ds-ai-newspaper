import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { GAMES } from "@/lib/games";

export const metadata = { title: "Games · The Data Science & AI Newspaper" };

export default function GamesPage() {
  return (
    <>
      <PageHeader title="Games" subtitle="A new Sudoku and Binary Grid every day at 00:00 UTC. Everyone gets the same puzzles — post your time to the daily leaderboard." />
      <div className="grid gap-6 md:grid-cols-2">
        {Object.values(GAMES).map((g) => (
          <Link
            key={g.id}
            href={`/games/${g.id}`}
            className="group flex flex-col rounded-lg border border-rule bg-surface p-6 transition-colors hover:border-rule-strong/60"
          >
            <span className="kicker text-kicker">Daily puzzle</span>
            <span className="font-headline mt-2 text-[1.6rem] text-ink group-hover:text-link">{g.name}</span>
            <span className="mt-2 text-[1rem] leading-relaxed text-text">{g.blurb}</span>
            <span className="mt-5 font-sans text-[0.875rem] font-medium text-link">Play today&apos;s puzzle →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
