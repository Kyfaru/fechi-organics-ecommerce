"use client"

import { useState } from "react"
import { Icon } from "@iconify/react"
import InboxMessage from "./InboxMessage"

type MessageType = "ORDER_UPDATE" | "SYSTEM" | "PROMOTION" | "ALERT"
interface Msg { id: string; type: MessageType; title: string; body: string; orderId: string | null; isRead: boolean; createdAt: string }

export default function InboxClient({
  initialMessages,
  initialUnread,
}: {
  initialMessages: Msg[]
  initialUnread: number
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [unread, setUnread] = useState(initialUnread)

  async function markRead(id: string) {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, isRead: true } : m))
    setUnread((u) => Math.max(0, u - 1))
    await fetch("/api/account/inbox", { method: "PATCH", body: JSON.stringify({ id }), headers: { "Content-Type": "application/json" } })
  }

  async function markAllRead() {
    setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })))
    setUnread(0)
    await fetch("/api/account/inbox", { method: "PATCH", body: JSON.stringify({ readAll: true }), headers: { "Content-Type": "application/json" } })
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
          <Icon icon="lucide:inbox" width={24} className="text-neutral-300" />
        </div>
        <p className="text-neutral-500 font-medium">Your inbox is empty</p>
        <p className="text-sm text-neutral-400 mt-1">Notifications about your orders and account will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {unread > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={markAllRead}
            className="text-sm text-[#15803D] font-medium hover:underline"
          >
            Mark all as read
          </button>
        </div>
      )}
      {messages.map((m) => (
        <InboxMessage key={m.id} {...m} onRead={markRead} />
      ))}
    </div>
  )
}
