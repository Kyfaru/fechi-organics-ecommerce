import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getRedis } from '@/lib/redis'
import { sessionChannel } from '@/lib/session-channel'
import { Ratelimit } from '@upstash/ratelimit'
import { makeRatelimit } from '@/lib/ratelimit'

// ponytail: module-level singleton avoids recreating on every request
const ratelimit = makeRatelimit(Ratelimit.slidingWindow(10, '1 m'), 'sse_session')

export async function GET(req: NextRequest) {
  // Gate 1: Auth
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  // Gate 2: Rate limit
  if (ratelimit) {
    const { success } = await ratelimit.limit(session.user.id)
    if (!success) return new Response('Too Many Requests', { status: 429 })
  }

  // Gate 3: Hashed channel keyed on session ID (not userId) — stale keys
  // from a previous session never affect a freshly logged-in session.
  const channel = sessionChannel(session.session.id)
  const redis = getRedis()

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      send({ type: 'connected' })

      // Server-side Redis poll every 2s (~10ms latency vs 1-4s Neon cold open)
      const poller = setInterval(async () => {
        try {
          const result = await redis.get(channel)
          if (result) {
            // @upstash/redis auto-deserializes JSON on get() — result may already be an object
            send(typeof result === 'string' ? JSON.parse(result) : result as object)
            cleanup()
            try { controller.close() } catch {}
          }
        } catch {}
      }, 2000)

      // Heartbeat keeps stream alive through Cloudflare's 30s idle timeout
      const heartbeat = setInterval(() => send({ type: 'ping' }), 25_000)

      function cleanup() {
        clearInterval(poller)
        clearInterval(heartbeat)
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
