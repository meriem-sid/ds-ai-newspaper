import "server-only";
import postgres from "postgres";

// One pooled client per server instance (reused across hot reloads in dev).
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (web/.env.local or Vercel project settings)");
  return postgres(url, {
    max: 5,
    idle_timeout: 20, // Neon drops idle connections; let the pool close them first
    connect_timeout: 30, // a suspended Neon compute takes a few seconds to wake
    prepare: false, // required for Neon's pooled (PgBouncer) connection string
  });
}

export function sql() {
  globalForDb.sql ??= createClient();
  return globalForDb.sql;
}
