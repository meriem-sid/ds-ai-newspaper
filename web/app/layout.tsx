import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { Suspense } from "react";
import { Inter, Newsreader } from "next/font/google";
import NavLinks, { NavLinksFallback } from "@/components/NavLinks";
import ThemeToggle, { themeBootScript } from "@/components/ThemeToggle";
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#1d2026" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by the boot script before hydration, so React must not complain about it.
    <html lang="en" suppressHydrationWarning className={`${newsreader.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-serif">
        {/* Injected into the initial HTML and run before hydration: no flash of the wrong theme. */}
        <Script id="theme-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:font-sans focus:text-sm">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
          <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
            <Link href="/" className="whitespace-nowrap font-serif text-lg font-semibold tracking-tight text-ink">
              DS &amp; AI<span className="hidden font-normal italic text-muted sm:inline"> Daily</span>
            </Link>
            <div className="flex items-center gap-1 sm:gap-3">
              {/* usePathname() is URL data: Cache Components requires a Suspense boundary. */}
              <Suspense fallback={<NavLinksFallback />}>
                <NavLinks />
              </Suspense>
              <span aria-hidden className="mx-1 hidden h-5 w-px bg-rule sm:block" />
              <ThemeToggle />
            </div>
          </nav>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24 sm:px-8">
          {children}
        </main>
        <footer className="border-t border-rule">
          <p className="mx-auto max-w-6xl px-5 py-8 text-center font-sans text-xs leading-relaxed text-muted sm:px-8">
            Compiled daily from research feeds, newsrooms, Kaggle, job boards and event listings. Every link goes to the original source.
          </p>
        </footer>
      </body>
    </html>
  );
}
