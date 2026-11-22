import { NextResponse, type NextRequest } from "next/server";
import { confirmSubscription } from "@/lib/subscriptions";

/** POST (form) token=… — the button on /subscribe/confirm. Redirects back with the result. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const status = await confirmSubscription(token);
  return NextResponse.redirect(new URL(`/subscribe/confirm?status=${status}`, request.url), 303);
}
