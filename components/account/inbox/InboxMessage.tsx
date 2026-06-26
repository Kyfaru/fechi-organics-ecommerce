import { Icon } from "@iconify/react"

type MessageType = "ORDER_UPDATE" | "SYSTEM" | "PROMOTION" | "ALERT"

interface InboxMessageProps {
  id: string
  type: MessageType
  title: string
  body: string
  orderId: string | null
  isRead: boolean
  createdAt: string | Date
  onRead: (id: string) => void
}

const TYPE_CONFIG: Record<MessageType, { icon: string; color: string; bg: string }> = {
  ORDER_UPDATE: { icon: "lucide:package",     color: "text-blue-600",    bg: "bg-blue-50"    },
  SYSTEM:       { icon: "lucide:info",         color: "text-neutral-500", bg: "bg-neutral-100" },
  PROMOTION:    { icon: "lucide:tag",          color: "text-[#15803D]",   bg: "bg-green-50"   },
  ALERT:        { icon: "lucide:bell-ring",    color: "text-amber-600",   bg: "bg-amber-50"   },
}

function fmtDate(d: string | Date) {
  const date = new Date(d)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return date.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short" })
}

export default function InboxMessage({ id, type, title, body, orderId, isRead, createdAt, onRead }: InboxMessageProps) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.SYSTEM

  return (
    <div
      className={[
        "flex gap-4 p-5 rounded-xl border transition-all duration-150 cursor-pointer",
        isRead
          ? "border-neutral-200 bg-white hover:border-neutral-300"
          : "border-[#15803D]/20 bg-[#F0FDF4] hover:border-[#15803D]/40",
      ].join(" ")}
      onClick={() => !isRead && onRead(id)}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
        <Icon icon={cfg.icon} width={17} className={cfg.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-[15px] leading-snug ${isRead ? "font-medium text-neutral-700" : "font-semibold text-neutral-900"}`}>
            {title}
          </p>
          <span className="text-xs text-neutral-400 shrink-0 mt-0.5">{fmtDate(createdAt)}</span>
        </div>
        <p className="text-sm text-neutral-500 mt-1.5 line-clamp-2">{body}</p>
        {orderId && (
          <a
            href={`/account/orders/${orderId}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 mt-2 text-sm text-[#15803D] font-medium hover:underline"
          >
            View Order <Icon icon="lucide:arrow-right" width={13} />
          </a>
        )}
      </div>

      {/* Unread dot */}
      {!isRead && (
        <div className="w-2.5 h-2.5 rounded-full bg-[#15803D] shrink-0 mt-2" />
      )}
    </div>
  )
}
