import "server-only";

/**
 * Minimal Resend client (plain HTTPS, no SDK). Needs RESEND_API_KEY and EMAIL_FROM,
 * e.g. EMAIL_FROM="DS & AI Daily <briefing@yourdomain.com>" — a domain verified in Resend.
 * Without a verified domain, Resend only delivers to your own account address.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }) {
  if (!emailConfigured()) throw new Error("email not configured (RESEND_API_KEY / EMAIL_FROM)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The double opt-in email: one button, plus a plain-text fallback. */
export function confirmationEmail(confirmUrl: string) {
  const subject = "Confirm your DS & AI Daily subscription";
  const text = [
    "Thanks for signing up for the DS & AI Daily briefing.",
    "",
    "Confirm your subscription by opening this link:",
    confirmUrl,
    "",
    "If you didn't sign up, ignore this email and you won't hear from us again.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f4;font-family:Georgia,'Times New Roman',serif;color:#1d1d1d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fcfcfb;border:1px solid #dcdcd8;border-radius:8px">
<tr><td style="padding:28px 28px 8px"><p style="margin:0;font:600 12px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6a6a6a">DS &amp; AI Daily</p>
<h1 style="margin:10px 0 0;font-size:24px;line-height:1.25">Confirm your subscription</h1></td></tr>
<tr><td style="padding:8px 28px 4px;font-size:16px;line-height:1.6;color:#333">One click and you'll get a short morning briefing: top stories, deadlines closing soon, and today's puzzles.</td></tr>
<tr><td style="padding:20px 28px"><a href="${esc(confirmUrl)}" style="display:inline-block;background:#1d1d1d;color:#f6f6f4;text-decoration:none;font:600 15px Arial,sans-serif;padding:12px 22px;border-radius:6px">Confirm subscription</a></td></tr>
<tr><td style="padding:0 28px 28px;font:13px/1.5 Arial,sans-serif;color:#6a6a6a">If you didn't sign up, ignore this email and you won't hear from us again.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
