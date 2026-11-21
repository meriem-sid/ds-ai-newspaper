"use server";

import { refresh } from "next/cache";
import { setArticleFlag } from "@/lib/data";

function checkId(id: unknown): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new Error("invalid article id");
  return n;
}

export async function setBookmarked(id: number, value: boolean) {
  await setArticleFlag(checkId(id), "is_bookmarked", Boolean(value));
  refresh(); // re-render server components (e.g. /saved, banner) with the new state
}

export async function setRead(id: number, value: boolean) {
  await setArticleFlag(checkId(id), "is_read", Boolean(value));
  refresh();
}
