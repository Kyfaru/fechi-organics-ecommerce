'use client'

import { useEffect, useRef, useState } from 'react'

export type PaymentStreamStatus = 'idle' | 'connecting' | 'pending' | 'stk_sent' | 'success' | 'failed' | 'timeout'

export function usePaymentStream(orderId: string | null): { status: PaymentStreamStatus; reason?: string } {
  const [status, setStatus] = useState<PaymentStreamStatus>('idle')
  const [reason, setReason] = useState<string | undefined>()
  const esRef = useRef<EventSource | null>(null)
  const errorCountRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!orderId) return

    const stopPoll = () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }

    setStatus('connecting')
    esRef.current?.close()
    stopPoll()
    errorCountRef.current = 0

    const es = new EventSource(`/api/payments/stream?orderId=${encodeURIComponent(orderId)}`)
    esRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; reason?: string }
        errorCountRef.current = 0
        switch (data.type) {
          case 'connected':
            setStatus('pending')
            break
          case 'stk_sent':
            // Dispatch (lib/payments/dispatch-stk.ts) has actually called the
            // gateway now — not terminal, so the stream stays open for the
            // real payment_success/payment_failed that follows.
            setStatus('stk_sent')
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
        // The stream is gone, but the payment may be perfectly alive — never
        // show "failed" (and a retry that risks a second charge) for a
        // dropped connection. Poll the order's real status instead.
        es.close()
        if (pollRef.current) return
        const startedAt = Date.now()
        pollRef.current = setInterval(async () => {
          try {
            const res = await fetch(`/api/payments/status/${encodeURIComponent(orderId)}`)
            const json = (await res.json()) as { data?: { paymentStatus?: string } }
            const s = json.data?.paymentStatus
            if (s === 'PAID') { stopPoll(); setStatus('success') }
            else if (s === 'FAILED') { stopPoll(); setReason('Payment failed.'); setStatus('failed') }
          } catch {}
          if (Date.now() - startedAt > 3 * 60_000) { stopPoll(); setStatus('timeout') }
        }, 3000)
        return
      }
      setStatus('connecting')
    }

    return () => {
      es.close()
      esRef.current = null
      stopPoll()
    }
  }, [orderId])

  return { status, reason }
}
