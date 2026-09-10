'use client'

/**
 * useInStorePaymentStream — admin in-store order wizard's equivalent of
 * hooks/use-payment-stream.ts (customer checkout). Near-identical copy,
 * pointed at the admin SSE endpoint instead of the customer one. A parallel
 * backend workstream owns GET /api/admin/orders/instore/stream and emits the
 * exact same event vocabulary (`connected`/`payment_success`/`payment_failed`
 * /`timeout`/`ping`) as the customer stream — not smoke-tested against a live
 * backend yet.
 */

import { useEffect, useRef, useState } from 'react'

export type InStorePaymentStreamStatus = 'idle' | 'connecting' | 'pending' | 'success' | 'failed' | 'timeout'

export function useInStorePaymentStream(inStoreOrderId: string | null): {
  status: InStorePaymentStreamStatus
  reason?: string
} {
  const [status, setStatus] = useState<InStorePaymentStreamStatus>('idle')
  const [reason, setReason] = useState<string | undefined>()
  const esRef = useRef<EventSource | null>(null)
  const errorCountRef = useRef(0)

  useEffect(() => {
    if (!inStoreOrderId) return

    // Synchronizing React state with the EventSource's connection lifecycle
    // — this mirrors hooks/use-payment-stream.ts's identical pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('connecting')
    esRef.current?.close()
    errorCountRef.current = 0

    const es = new EventSource(`/api/admin/orders/instore/stream?inStoreOrderId=${encodeURIComponent(inStoreOrderId)}`)
    esRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; reason?: string }
        errorCountRef.current = 0
        switch (data.type) {
          case 'connected':
            setStatus('pending')
            break
          case 'payment_success':
            setStatus('success')
            es.close()
            break
          case 'payment_failed':
            setReason(data.reason)
            setStatus('failed')
            es.close()
            break
          case 'timeout':
            setStatus('timeout')
            es.close()
            break
          // 'ping' — ignored, keepalive only
        }
      } catch {}
    }

    es.onerror = () => {
      errorCountRef.current += 1
      // After 3 consecutive errors (e.g. order deleted, auth lost), give up
      if (errorCountRef.current > 3) {
        setStatus('failed')
        setReason('Connection lost. Please check your order status.')
        es.close()
        return
      }
      setStatus('connecting')
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [inStoreOrderId])

  return { status, reason }
}
