"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

/**
 * Runs inline in <head> before first paint (see app/layout.tsx): saved choice
 * first, otherwise the OS preference. Prevents a flash of the wrong theme.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t}catch(e){}})()`;

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  // Re-render when <html data-theme> changes (this toggle, or another tab via storage).
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // Until the reader picks a theme, keep following the OS setting live.
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (!savedTheme()) apply(media.matches ? "dark" : "light");
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) apply(savedTheme() ?? (media.matches ? "dark" : "light"));
  };
  media.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getServerSnapshot = (): Theme | null => null;

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode / storage disabled: the toggle still works for this page view
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme ? `Switch to ${next} mode` : "Toggle colour theme"}
      title={theme ? `Switch to ${next} mode` : "Toggle colour theme"}
      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-chip hover:text-ink"
    >
      {/* Before hydration the theme is unknown on the server: render an empty slot of the same size. */}
      {theme === "dark" ? <SunIcon /> : theme === "light" ? <MoonIcon /> : <span className="h-4 w-4" />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}
