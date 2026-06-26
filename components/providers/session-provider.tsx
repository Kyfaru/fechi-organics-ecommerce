'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/lib/stores/session-store'
import { getSession } from '@/lib/auth-client'

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const setSession = useSessionStore((s) => s.setSession)
  const clearSession = useSessionStore((s) => s.clearSession)
  const userId = useSessionStore((s) => s.user?.id)
  const router = useRouter()

  // Bootstrap session exactly once on mount
  useEffect(() => {
    getSession()
      .then((res) => {
        if (res?.data?.user) {
          setSession(res.data.user as Parameters<typeof setSession>[0])
        } else {
          clearSession()
        }
      })
      .catch(() => clearSession())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Open SSE for real-time cross-tab invalidation when logged in
  useEffect(() => {
    if (!userId) return

    const es = new EventSource('/api/auth/stream')

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string }
        if (data.type === 'session_invalidated') {
          clearSession()
          es.close()
          router.push('/login?reason=session_expired')
        }
      } catch {}
    }

    return () => es.close()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}
