import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/lib/subscriptions";

/**
 * POST /api/unsubscribe?token=…
 *  - from mail clients' one-click button (RFC 8058: body "List-Unsubscribe=One-Click") → 200
 *  - from the button on /unsubscribe (form with token) → redirect back with the result
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = String(request.nextUrl.searchParams.get("token") ?? form?.get("token") ?? "");
  const status = await unsubscribe(token);
  if (form?.get("List-Unsubscribe") === "One-Click") {
    return new NextResponse(status === "unsubscribed" ? "Unsubscribed." : "Unknown link.", { status: status === "unsubscribed" ? 200 : 404 });
  }
  return NextResponse.redirect(new URL(`/unsubscribe?status=${status}`, request.url), 303);
}
