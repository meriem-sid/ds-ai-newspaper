"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Today", match: (p: string) => p === "/" || p.startsWith("/edition") },
  { href: "/saved", label: "Saved", match: (p: string) => p.startsWith("/saved") },
  { href: "/archive", label: "Archive", match: (p: string) => p.startsWith("/archive") },
  { href: "/games", label: "Games", match: (p: string) => p.startsWith("/games") },
];

export default function NavLinks() {
  return <NavList pathname={usePathname() ?? "/"} />;
}

/** Same links without the active highlight: the <Suspense> fallback while the URL is read. */
export function NavLinksFallback() {
  return <NavList pathname={null} />;
}

function NavList({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex items-center gap-0.5 sm:gap-2">
      {NAV.map((item) => {
        const active = pathname !== null && item.match(pathname);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-1.5 py-1.5 font-sans text-[0.75rem] font-medium transition-colors sm:px-3 sm:text-[0.8125rem] ${
                active ? "bg-chip text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
