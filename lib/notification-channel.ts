import { getRedis } from "@/lib/redis";

/**
 * A single global "something changed" signal — not a per-notification
 * payload. Every mutation (create, mark-read, mark-all-read, pin) bumps this
 * key; app/api/admin/notifications/stream/route.ts polls it and tells
 * connected admins to refetch their (RBAC-scoped) unread-count/list/preview
 * queries. Keeping the push channel payload-free means it can never leak
 * data across the RBAC boundary — only the scoped GET routes can.
 */
const VERSION_KEY = "notif:version";

export async function bumpNotificationVersion(): Promise<void> {
  try {
    await getRedis().set(VERSION_KEY, Date.now());
  } catch (e) {
    console.error("[notifications] Failed to bump version:", e);
  }
}

export async function getNotificationVersion(): Promise<number> {
  const value = await getRedis().get(VERSION_KEY);
  return typeof value === "number" ? value : Number(value) || 0;
}

export const NOTIFICATION_VERSION_KEY = VERSION_KEY;
