import { createHash } from 'crypto'

// Mirrors lib/payment-channel.ts's hashing scheme — the ticketId never
// appears in the Redis key name itself.
export function ticketChannel(ticketId: string): string {
  return `ticket:${createHash('sha256')
    .update(ticketId + (process.env.REDIS_CHANNEL_SECRET ?? 'dev-secret'))
    .digest('hex')
    .slice(0, 40)}`
}
