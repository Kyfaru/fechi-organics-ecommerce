'use client'

import { useEffect, useRef, useState } from 'react'

export type PaymentStreamStatus = 'idle' | 'connecting' | 'pending' | 'success' | 'failed' | 'timeout'

export function usePaymentStream(orderId: string | null): { status: PaymentStreamStatus; reason?: string } {
  const [status, setStatus] = useState<PaymentStreamStatus>('idle')
  const [reason, setReason] = useState<string | undefined>()
  const esRef = useRef<EventSource | null>(null)
  const errorCountRef = useRef(0)

  useEffect(() => {
    if (!orderId) return

    setStatus('connecting')
    esRef.current?.close()
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
  }, [orderId])

  return { status, reason }
}
