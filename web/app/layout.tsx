import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Data Science & AI Newspaper",
  description: "A daily, no-hype briefing: research, releases, hackathons, jobs and events for early-career data & AI engineers.",
};

const NAV = [
  { href: "/", label: "Today" },
  { href: "/saved", label: "Saved" },
  { href: "/archive", label: "Archive" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${newsreader.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-serif">
        <header className="border-b border-rule">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6">
            <Link href="/" className="kicker text-ink">
              DS &amp; AI Daily
            </Link>
            <ul className="flex gap-5">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="kicker text-muted hover:text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">{children}</main>
        <footer className="border-t border-rule py-6 text-center font-sans text-xs text-muted">
          Compiled daily from research feeds, newsrooms, Kaggle, job boards and event listings. Links go to the original sources.
        </footer>
      </body>
    </html>
  );
}
