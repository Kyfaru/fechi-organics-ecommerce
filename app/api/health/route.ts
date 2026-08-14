import { db } from "@/lib/db";

/**
 * Health check — verifies the dependencies API routes actually need at
 * runtime, not just that the server process is up. Existing to debug "page
 * throws a 500 and the logs don't say why" cases: hit this directly (or let
 * a client call it after a failed fetch) to see which dependency is down.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (e) {
    checks.database = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  checks.env = process.env.DATABASE_URL
    ? { ok: true }
    : { ok: false, error: "DATABASE_URL is not set" };

  const allOk = Object.values(checks).every((c) => c.ok);
  return Response.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}