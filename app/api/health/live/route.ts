import { connection } from "next/server";

// Liveness probe: process is up and serving. Deliberately touches no
// dependency (DB/Redis) so a Neon cold start or Redis blip can't get the
// container killed — use /api/health for the dependency-checking readiness probe.
// connection() opts out of build-time prerendering (cacheComponents forbids
// `export const dynamic`), so this really answers per request.
export async function GET() {
  await connection();
  return Response.json({ ok: true });
}
