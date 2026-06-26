import { createHash } from 'crypto'

export function paymentChannel(orderId: string): string {
  return `payment:${createHash('sha256')
    .update(orderId + (process.env.REDIS_CHANNEL_SECRET ?? 'dev-secret'))
    .digest('hex')
    .slice(0, 40)}`
}
