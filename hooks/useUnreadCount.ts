"use client"
import { useQuery } from "@tanstack/react-query"

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ["inbox-unread-count"],
    queryFn: async () => {
      const r = await fetch("/api/account/inbox?countOnly=true")
      if (!r.ok) return { unreadCount: 0 }
      return r.json() as Promise<{ unreadCount: number }>
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  return (data as { unreadCount?: number } | undefined)?.unreadCount ?? 0
}
