"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotificationStream } from "@/hooks/use-notification-stream";
import { toast } from "@/lib/toast";
import { SeverityBadge } from "@/components/admin/ui/SeverityBadge";

interface PreviewNotification {
  id: string;
  type: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  isRead: boolean;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

/**
 * Desktop: click opens an inline dropdown preview (top 5, same
 * absolutely-positioned pattern as GlobalSearchModal — no new dependency).
 * Mobile: falls back to the original direct-link-to-page behavior, since
 * there's no room for a floating panel.
 */
export function NotificationBell() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const seenCriticalRef = useRef<Set<string> | null>(null);

  const { data: countData } = useQuery({
    queryKey: ["admin-notifications-unread-count"],
    queryFn: () => fetch("/api/admin/notifications/unread-count").then((r) => r.json()),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const unreadCount = countData?.data?.count ?? 0;

  const { data: previewData } = useQuery({
    queryKey: ["admin-notifications-preview"],
    queryFn: () => fetch("/api/admin/notifications/preview").then((r) => r.json()),
    staleTime: 15 * 1000,
    refetchInterval: 60 * 1000,
  });
  const preview: PreviewNotification[] = previewData?.data?.notifications ?? [];

  useNotificationStream(true, () => {
    qc.invalidateQueries({ queryKey: ["admin-notifications-unread-count"] });
    qc.invalidateQueries({ queryKey: ["admin-notifications-preview"] });
  });

  // In-session toast for newly-appeared CRITICAL+unread items. Skips the
  // first render (seenCriticalRef starts null) so opening the app doesn't
  // replay every pre-existing critical item as a toast.
  useEffect(() => {
    const criticalUnread = preview.filter((n) => n.severity === "CRITICAL" && !n.isRead);
    if (seenCriticalRef.current === null) {
      seenCriticalRef.current = new Set(criticalUnread.map((n) => n.id));
      return;
    }
    for (const n of criticalUnread) {
      if (!seenCriticalRef.current.has(n.id)) {
        toast.critical(n.title, { message: n.body, actionUrl: n.link ?? undefined });
      }
    }
    seenCriticalRef.current = new Set(criticalUnread.map((n) => n.id));
  }, [preview]);

  if (isMobile) {
    return (
      <Link
        href="/admin/notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-(--danger) rounded-full" />}
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-(--danger) text-white text-[10px] font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[360px] z-50 rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-(--neutral-200) dark:border-(--dark-border) font-dm text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
            Notifications
          </div>
          {preview.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-(--neutral-400)">No notifications yet</div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto divide-y divide-(--neutral-100) dark:divide-(--dark-border)">
              {preview.map((n) => (
                <button
                  key={n.id}
                  onMouseDown={() => {
                    setOpen(false);
                    if (n.link) router.push(n.link);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-(--neutral-50) dark:hover:bg-(--dark-border) transition-colors flex gap-2"
                >
                  <SeverityBadge severity={n.severity} dotOnly />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[13px] ${n.isRead ? "font-normal" : "font-semibold"} text-(--neutral-900) dark:text-(--dark-text) truncate`}
                    >
                      {n.title}
                    </p>
                    <p className="text-[12px] text-(--neutral-500) dark:text-(--dark-muted) truncate">{n.body}</p>
                    <p className="text-[11px] text-(--neutral-400) mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <Link
            href="/admin/notifications"
            onMouseDown={() => setOpen(false)}
            className="block px-4 py-2.5 text-center text-[13px] font-medium text-(--green-700) hover:bg-(--green-50) dark:hover:bg-(--dark-border) border-t border-(--neutral-200) dark:border-(--dark-border) transition-colors"
          >
            Show all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
