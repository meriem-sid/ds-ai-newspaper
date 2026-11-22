"use client";

/**
 * Per-visitor reading state, kept in this browser only (localStorage).
 * Nothing here touches the shared database, so public visitors can't
 * change what other people see.
 *
 * Shape: { v: 1, read: number[], saved: number[] } — article ids.
 */
import { useCallback, useSyncExternalStore } from "react";

const KEY = "reader-state:v1";
const CHANGE_EVENT = "reader-state-change"; // same-tab updates (the storage event only fires in other tabs)
const MAX_IDS = 2000; // keep storage bounded; oldest entries drop off first

type State = { read: number[]; saved: number[] };
const EMPTY: State = { read: [], saved: [] };

let cache: { raw: string | null; state: State } | null = null;

function load(): State {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY; // storage blocked (private mode, disabled cookies)
  }
  if (cache && cache.raw === raw) return cache.state; // stable snapshot for useSyncExternalStore
  let state = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.read) && Array.isArray(parsed.saved)) {
      state = {
        read: parsed.read.filter(Number.isInteger),
        saved: parsed.saved.filter(Number.isInteger),
      };
    }
  } catch {
    // corrupted value: start fresh rather than crash the page
  }
  cache = { raw, state };
  return state;
}

function save(next: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, read: next.read.slice(-MAX_IDS), saved: next.saved.slice(-MAX_IDS) }));
  } catch {
    // quota exceeded or storage blocked: the UI still updates for this page view
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  // Components hydrated inside streamed <Suspense> boundaries keep the server snapshot
  // (null) until the store reports a change. Report one right after subscribing so the
  // saved state shows on page load, not only after the first click.
  queueMicrotask(onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => null; // the server has no visitor state: render "unread, not saved"

function update(list: keyof State, id: number, on: boolean) {
  const current = load();
  const ids = current[list].filter((x) => x !== id);
  if (on) ids.push(id);
  save({ ...current, [list]: ids });
}

/** Whole state, or null before hydration (server render / first client render). */
export function useReaderState(): State | null {
  return useSyncExternalStore(subscribe, load, getServerSnapshot);
}

/** Read/saved flags and toggles for one article. */
export function useArticleFlags(id: number) {
  const state = useReaderState();
  const isRead = !!state?.read.includes(id);
  const isSaved = !!state?.saved.includes(id);
  return {
    isRead,
    isSaved,
    ready: state !== null,
    setRead: useCallback((on: boolean) => update("read", id, on), [id]),
    setSaved: useCallback((on: boolean) => update("saved", id, on), [id]),
  };
}
