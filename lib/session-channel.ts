import { createHash } from 'crypto'

// Uses session.session.id (per-session, not per-user) so logout + re-login
// creates a new channel — no stale invalidation keys from previous sessions.
export function sessionChannel(sessionId: string): string {
  return `sess:${createHash('sha256')
    .update(sessionId + (process.env.REDIS_CHANNEL_SECRET ?? 'dev-secret'))
    .digest('hex')
    .slice(0, 32)}`
}
