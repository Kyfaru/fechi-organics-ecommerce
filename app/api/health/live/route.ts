// Liveness probe: process is up and serving. Deliberately touches no
// dependency (DB/Redis) so a Neon cold start or Redis blip can't get the
// container killed — use /api/health for the dependency-checking readiness probe.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
