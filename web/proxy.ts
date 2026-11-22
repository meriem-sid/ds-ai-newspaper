import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional password gate. The app can write to the database (bookmarks, read state),
 * so on a public Vercel URL set SITE_PASSWORD to require HTTP Basic auth
 * (any username, that password). Leave it unset for local development.
 */
// Email links must work for people who can't log in (and for mail clients' one-click
// unsubscribe, which sends no credentials), so these paths are never gated.
const OPEN_PATHS = ["/subscribe/confirm", "/unsubscribe", "/api/subscribe/confirm", "/api/unsubscribe"];

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  if (OPEN_PATHS.some((p) => request.nextUrl.pathname === p)) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (constantTimeEqual(supplied, password)) return NextResponse.next();
    } catch {
      // malformed header → fall through to the challenge
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="DS & AI Newspaper", charset="UTF-8"' },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
