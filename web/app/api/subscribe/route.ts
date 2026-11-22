import { NextResponse, type NextRequest } from "next/server";
import { confirmationEmail, emailConfigured, sendEmail, siteUrl } from "@/lib/email";
import { SIGNUPS_PER_HOUR_PER_VISITOR, cleanEmail, clearConfirmThrottle, recentSignups, requestSignup } from "@/lib/subscriptions";
import { visitorHash } from "@/lib/visitor";

// Same reply whether the address is new, pending or already subscribed: the form
// must not reveal who is on the list.
const CHECK_INBOX = "Check your inbox: we've sent a link to confirm your subscription.";

/** POST /api/subscribe { email, website } — `website` is a honeypot field humans never see. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 1000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: { email?: unknown; website?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ message: CHECK_INBOX }); // a bot filled the hidden field: pretend success
  }
  const email = cleanEmail(body.email);
  if (!email) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 422 });
  if (!emailConfigured()) return NextResponse.json({ error: "Email briefings aren't switched on yet." }, { status: 503 });

  const ipHash = visitorHash(request);
  if ((await recentSignups(ipHash)) >= SIGNUPS_PER_HOUR_PER_VISITOR) {
    return NextResponse.json({ error: "Too many sign-ups from this connection. Try again in an hour." }, { status: 429 });
  }

  const result = await requestSignup(email, ipHash);
  if (result.send) {
    const confirmUrl = `${siteUrl()}/subscribe/confirm?token=${result.verifyToken}`;
    try {
      await sendEmail({ to: email, ...confirmationEmail(confirmUrl) });
    } catch (err) {
      console.error("subscribe: confirmation email failed", err instanceof Error ? err.message : err);
      await clearConfirmThrottle(email);
      return NextResponse.json({ error: "We couldn't send the confirmation email. Try again later." }, { status: 502 });
    }
  }
  return NextResponse.json({ message: CHECK_INBOX });
}
