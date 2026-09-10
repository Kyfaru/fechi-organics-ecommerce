'use client'

import { useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
// Subscribes to /api/tickets/stream for a given ticket and calls `onMessage`
// whenever a new reply is posted (by either side). Structurally mirrors
// hooks/use-payment-stream.ts (EventSource, error-count-based give-up after
// 3 consecutive errors) but — unlike the one-shot payment stream — a ticket
// thread is long-lived, so this hook reconnects after each delivered event
// (and after a 10-minute server-side timeout) to keep listening for further
// replies until the component unmounts.
// ---------------------------------------------------------------------------
export function useTicketStream(ticketId: string | null, onMessage: () => void): void {
  const esRef = useRef<EventSource | null>(null)
  const errorCountRef = useRef(0)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!ticketId) return
    let cancelled = false

    function connect() {
      if (cancelled) return
      esRef.current?.close()
      errorCountRef.current = 0

      const es = new EventSource(`/api/tickets/stream?ticketId=${encodeURIComponent(ticketId!)}`)
      esRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type: string }
          errorCountRef.current = 0
          switch (data.type) {
            case 'new_message':
              onMessageRef.current()
              es.close()
              connect() // reopen — more replies may still arrive on this thread
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
        // After 3 consecutive errors (auth lost, ticket deleted, etc.) give up —
        // the consuming component's own polling (if any) covers the gap.
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
  }, [ticketId])
}
