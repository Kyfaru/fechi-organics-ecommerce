import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { paymentChannel } from '@/lib/payment-channel'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function makeRatelimit() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    prefix: 'sse_payment',
  })
}

const ratelimit = makeRatelimit()

export async function GET(req: NextRequest) {
  // Gate 1: Auth
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId || orderId.length < 10) {
    return new Response('Bad Request', { status: 400 })
  }

  // Gate 2: Rate limit
  if (ratelimit) {
    const { success } = await ratelimit.limit(session.user.id)
    if (!success) return new Response('Too Many Requests', { status: 429 })
  }

  // Gate 3: Ownership — orderId must belong to this user
  const order = await db.order.findFirst({
    where: { id: orderId, userId: session.user.id },
    select: { id: true, paymentStatus: true, status: true },
  })
  if (!order) return new Response('Forbidden', { status: 403 })

  // Short-circuit: order already resolved — no stream needed
  if (order.paymentStatus === 'PAID' || order.status === 'CONFIRMED') {
    return Response.json({ type: 'payment_success', orderId, immediate: true })
  }
  if (order.paymentStatus === 'FAILED') {
    return Response.json({
      type: 'payment_failed',
      orderId,
      reason: 'Payment was previously failed',
      immediate: true,
    })
  }

  // Gate 4: Hashed channel — orderId never appears in Redis key names
  const channel = paymentChannel(orderId)
  const redis = getRedis()

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      send({ type: 'connected', orderId })

      // Poll Redis every 1s — server-to-server, ~10ms latency
      const poller = setInterval(async () => {
        try {
          const result = await redis.get(channel)
          if (result) {
            // @upstash/redis auto-deserializes JSON on get() — result may already be an object
            send(typeof result === 'string' ? JSON.parse(result) : result as object)
            cleanup()
            // Brief delay lets the event flush before close
            setTimeout(() => { try { controller.close() } catch {} }, 100)
          }
        } catch {}
      }, 1000)

      const heartbeat = setInterval(() => send({ type: 'ping' }), 25_000)

      // 10-minute hard cap — prevents zombie streams
      const maxTimeout = setTimeout(() => {
        send({ type: 'timeout', message: 'Payment confirmation window expired' })
        cleanup()
        try { controller.close() } catch {}
      }, 10 * 60 * 1000)

      function cleanup() {
        clearInterval(poller)
        clearInterval(heartbeat)
        clearTimeout(maxTimeout)
      }

      req.signal.addEventListener('abort', () => {
        cleanup()
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
