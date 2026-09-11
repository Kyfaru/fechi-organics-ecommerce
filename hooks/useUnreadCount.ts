"use client"
import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/lib/auth-client"

export function useUnreadCount() {
  const { data: session } = useSession()
  const { data } = useQuery({
    queryKey: ["inbox-unread-count"],
    queryFn: async () => {
      const r = await fetch("/api/account/inbox?countOnly=true")
      if (!r.ok) return { unreadCount: 0 }
      return r.json() as Promise<{ unreadCount: number }>
    },
    // Guests (now able to browse checkout without an account) have no inbox
    // to poll — skip the request entirely instead of hitting it every 60s
    // just to get a 401 back.
    enabled: !!session?.user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  return (data as { unreadCount?: number } | undefined)?.unreadCount ?? 0
}
