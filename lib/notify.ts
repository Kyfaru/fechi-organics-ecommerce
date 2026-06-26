import { db } from "@/lib/db";

export async function createNotification(
  type: string,
  title: string,
  body: string,
  link?: string,
) {
  try {
    await db.notification.create({ data: { type, title, body, link } });
  } catch (e) {
    // Non-fatal — never let notification failure break the main flow
    console.error("[notify] Failed to create notification:", e);
  }
}
