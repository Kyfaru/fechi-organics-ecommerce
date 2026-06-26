"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, ExternalLink, CheckCheck } from "lucide-react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  order: "bg-blue-100 text-blue-700",
  admin: "bg-purple-100 text-purple-700",
  blog: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

export function NotificationsClient() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => fetch("/api/admin/notifications").then((r) => r.json()),
    staleTime: 30 * 1000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/notifications/${id}`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => fetch("/api/admin/notifications/all", { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
    },
  });

  const notifications: Notification[] = data?.data?.notifications ?? [];
  const unread = notifications.filter((n) => !n.read);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-[28px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">Notifications</h1>
          <p className="font-dm text-[14px] text-(--neutral-500) dark:text-(--dark-muted)">{unread.length} unread</p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="flex items-center gap-1.5 text-[13px] font-medium text-(--green-700) hover:text-(--green-900) transition-colors"
          >
            <CheckCheck size={15} />
            Mark all read
          </button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-(--neutral-100) animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-(--neutral-400)">
          <Bell size={36} strokeWidth={1.2} />
          <p className="font-dm text-[14px]">No notifications yet</p>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={[
              "flex gap-4 p-4 rounded-xl border transition-colors",
              n.read
                ? "bg-white dark:bg-(--dark-surface) border-(--neutral-200) dark:border-(--dark-border)"
                : "bg-(--green-50) dark:bg-(--dark-surface) border-(--green-200) dark:border-(--green-800)",
            ].join(" ")}
          >
            <span className={`mt-0.5 shrink-0 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full h-fit ${TYPE_COLORS[n.type] ?? "bg-gray-100 text-gray-600"}`}>
              {n.type}
            </span>

            <div className="flex-1 min-w-0">
              <p className="font-dm text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">{n.title}</p>
              <p className="text-[13px] text-(--neutral-500) dark:text-(--dark-muted) mt-0.5">{n.body}</p>
              <p className="text-[11px] text-(--neutral-400) mt-1">{timeAgo(n.createdAt)}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {n.link && (
                <Link
                  href={n.link}
                  className="p-1.5 rounded-lg text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
                  title="Go to"
                >
                  <ExternalLink size={14} />
                </Link>
              )}
              {!n.read && (
                <button
                  onClick={() => markRead.mutate(n.id)}
                  className="p-1.5 rounded-lg text-(--green-600) hover:bg-(--green-50) dark:hover:bg-(--dark-border) transition-colors"
                  title="Mark read"
                >
                  <CheckCheck size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
