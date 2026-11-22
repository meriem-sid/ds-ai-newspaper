import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "./db";

export const SIGNUPS_PER_HOUR_PER_VISITOR = 5;
export const CONFIRM_RESEND_AFTER_MINUTES = 10;
export const CONFIRM_LINK_DAYS = 7;

const token = () => randomBytes(32).toString("hex"); // 64 hex chars, unguessable

/** Lowercased, trimmed, sanity-checked address — or null. (Real validation is the confirmation email.) */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email)) return null;
  return email;
}

/** How many confirmation emails this visitor triggered in the last hour (rate limit). */
export async function recentSignups(ipHash: string): Promise<number> {
  const [{ n }] = await sql()<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM subscribers
    WHERE signup_ip_hash = ${ipHash} AND confirm_sent_at > NOW() - INTERVAL '1 hour'`;
  return n;
}

export type SignupResult = { send: false } | { send: true; verifyToken: string };

/**
 * Create or refresh a pending subscription. Returns whether to send a confirmation
 * email. Active subscribers and very recent requests get no new email (but the caller
 * shows the same message either way, so the form never reveals who is subscribed).
 */
export async function requestSignup(email: string, ipHash: string): Promise<SignupResult> {
  const db = sql();
  const [existing] = await db<{ status: string; recent: boolean }[]>`
    SELECT status, confirm_sent_at > NOW() - make_interval(mins => ${CONFIRM_RESEND_AFTER_MINUTES}) AS recent
    FROM subscribers WHERE email = ${email}`;
  if (existing?.status === "active" || existing?.recent) return { send: false };

  const verifyToken = token();
  await db`
    INSERT INTO subscribers (email, status, verify_token, unsubscribe_token, confirm_sent_at, signup_ip_hash)
    VALUES (${email}, 'pending', ${verifyToken}, ${token()}, NOW(), ${ipHash})
    ON CONFLICT (email) DO UPDATE
      SET status = 'pending', verify_token = EXCLUDED.verify_token,
          confirm_sent_at = NOW(), signup_ip_hash = EXCLUDED.signup_ip_hash, unsubscribed_at = NULL`;
  return { send: true, verifyToken };
}

/** Confirm a pending subscription. Links expire after CONFIRM_LINK_DAYS and work once. */
export async function confirmSubscription(verifyToken: string): Promise<"confirmed" | "invalid"> {
  if (!/^[0-9a-f]{64}$/.test(verifyToken)) return "invalid";
  const rows = await sql()`
    UPDATE subscribers SET status = 'active', confirmed_at = NOW(), verify_token = NULL
    WHERE verify_token = ${verifyToken} AND status = 'pending'
      AND confirm_sent_at > NOW() - make_interval(days => ${CONFIRM_LINK_DAYS})
    RETURNING id`;
  return rows.length ? "confirmed" : "invalid";
}

/** Unsubscribe by the stable per-subscriber token (idempotent). */
export async function unsubscribe(unsubscribeToken: string): Promise<"unsubscribed" | "invalid"> {
  if (!/^[0-9a-f]{64}$/.test(unsubscribeToken)) return "invalid";
  const rows = await sql()`
    UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, NOW()), verify_token = NULL
    WHERE unsubscribe_token = ${unsubscribeToken}
    RETURNING id`;
  return rows.length ? "unsubscribed" : "invalid";
}

/** If the confirmation email couldn't be sent, let the person retry straight away. */
export async function clearConfirmThrottle(email: string): Promise<void> {
  await sql()`UPDATE subscribers SET confirm_sent_at = NULL WHERE email = ${email} AND status = 'pending'`;
}
