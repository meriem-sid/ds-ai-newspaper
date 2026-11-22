import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * A stable, non-reversible visitor id: SHA-256 of (salt + IP). The raw IP is never
 * stored. Vercel sets x-forwarded-for / x-real-ip; locally there is no proxy.
 */
export function visitorHash(request: NextRequest): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local";
  const salt = process.env.RATE_LIMIT_SALT || "dev-only-salt-set-RATE_LIMIT_SALT-in-production";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
