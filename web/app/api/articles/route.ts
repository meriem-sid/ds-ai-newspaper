import { NextResponse, type NextRequest } from "next/server";
import { getArticlesByIds } from "@/lib/data";

/**
 * GET /api/articles?ids=12,34,56 — the articles a visitor saved in their browser.
 * Read-only and public: it returns the same published stories anyone can see.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("ids") ?? "";
  if (raw.length > 3000) return NextResponse.json({ error: "too many ids" }, { status: 400 });
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const articles = await getArticlesByIds(ids);
  return NextResponse.json({ articles }, { headers: { "Cache-Control": "no-store" } });
}
