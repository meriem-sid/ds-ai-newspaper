"use client";

import { useSyncExternalStore } from "react";

type Style = "classic" | "colorful";
const STORAGE_KEY = "style";

function apply(style: Style) {
  document.documentElement.dataset.style = style;
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // storage blocked: the switch still works for this page view
  }
}

function subscribe(onChange: () => void) {
  // <html data-style> is the source of truth (set before paint by the boot script).
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-style"] });
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) document.documentElement.dataset.style = e.newValue === "colorful" ? "colorful" : "classic";
  };
  window.addEventListener("storage", onStorage); // keep other open tabs in step
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): Style => (document.documentElement.dataset.style === "colorful" ? "colorful" : "classic");
const getServerSnapshot = (): Style | null => null;

/** Switches between the Classic broadsheet and the Colourful front-page look. */
export default function StyleToggle() {
  const style = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next: Style = style === "colorful" ? "classic" : "colorful";
  const label = style ? `Switch to ${next === "colorful" ? "colourful" : "classic"} style` : "Switch newspaper style";

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-chip hover:text-ink"
    >
      {style === "colorful" ? <ColourIcon /> : style === "classic" ? <ClassicIcon /> : <span className="h-4 w-4" />}
    </button>
  );
}

/** Shown while Classic is active: four grey columns (a broadsheet). */
function ClassicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M7 8h10M7 11.5h4M13 11.5h4M7 15h4M13 15h4" />
    </svg>
  );
}

/** Shown while Colourful is active: colour swatches. */
function ColourIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
      <rect x="3.5" y="4" width="17" height="5" rx="1" fill="#0b5cad" />
      <rect x="3.5" y="11" width="8" height="9" rx="1" fill="#c8222c" />
      <rect x="12.5" y="11" width="8" height="4" rx="1" fill="#e8a90c" />
      <rect x="12.5" y="16" width="8" height="4" rx="1" fill="#18834a" />
    </svg>
  );
}
