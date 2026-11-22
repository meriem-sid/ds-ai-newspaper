"use client";

import { useArticleFlags } from "@/lib/readerState";

/** Dims its children once this visitor has read the article (used inside server components). */
export default function ReadDim({ id, children, className = "" }: { id: number; children: React.ReactNode; className?: string }) {
  const { isRead } = useArticleFlags(id);
  return <li className={`${className} transition-opacity ${isRead ? "opacity-60" : ""}`}>{children}</li>;
}
