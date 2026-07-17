'use client'

import { useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
// Subscribes to /api/admin/notifications/stream and calls `onUpdate` whenever
// the global "something changed" signal fires (a notification was created,
// read, or pinned by anyone in scope). Structurally mirrors
// hooks/use-ticket-stream.ts: reconnects after each delivered event (and
// after the server's 10-minute timeout) using the last-seen version as the
// new baseline, so it keeps listening indefinitely until unmount.
// ---------------------------------------------------------------------------
export function useNotificationStream(enabled: boolean, onUpdate: () => void): void {
  const esRef = useRef<EventSource | null>(null)
  const errorCountRef = useRef(0)
  const versionRef = useRef(0)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    function connect() {
      if (cancelled) return
      esRef.current?.close()
      errorCountRef.current = 0

      const es = new EventSource(`/api/admin/notifications/stream?since=${versionRef.current}`)
      esRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type: string; version?: number }
          errorCountRef.current = 0
          switch (data.type) {
            case 'update':
              if (typeof data.version === 'number') versionRef.current = data.version
              onUpdateRef.current()
              es.close()
              connect() // reopen — more updates may still arrive
              break
            case 'timeout':
              es.close()
              connect() // hit the server's 10-minute cap — reopen a fresh stream
              break
            // 'connected' / 'ping' — no action needed
          }
        } catch {}
      }

      es.onerror = () => {
        errorCountRef.current += 1
        // After 3 consecutive errors (auth lost, etc.) give up — the badge's
        // own 60s-or-longer polling fallback (if any) covers the gap.
        if (errorCountRef.current > 3) {
          es.close()
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      esRef.current?.close()
      esRef.current = null
    }
  }, [enabled])
}
