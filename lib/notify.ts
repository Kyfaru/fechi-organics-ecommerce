import { db } from "@/lib/db";
import { bumpNotificationVersion } from "@/lib/notification-channel";
import type { NotificationSeverity, NotificationType } from "@prisma/client";

// Default severity per type at creation time — still overridable per-call
// (e.g. a VIP order might warrant CRITICAL even though ORDER_NEW defaults to
// WARNING). Design doc Section 4.
const DEFAULT_SEVERITY: Record<NotificationType, NotificationSeverity> = {
  ORDER_NEW: "WARNING",
  ORDER_FAILED: "CRITICAL",
  PAYMENT_ERROR: "CRITICAL",
  PRODUCT_ADDED: "INFO",
  PRODUCT_DELETED: "WARNING",
  STAFF_ADDED: "INFO",
  STAFF_REMOVED: "INFO",
  TICKET_NEW: "WARNING",
  TICKET_RESPONSE: "INFO",
  CONTACT_INQUIRY: "INFO",
  DELIVERY_ZONE_REQUEST: "INFO",
  ADMIN_ADDED: "INFO",
  SYSTEM_ALERT: "CRITICAL",
};

interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  severity?: NotificationSeverity;
  /** null/omitted = HQ-wide, visible only to the global (Super Admin/Admin) tier */
  branchId?: string | null;
  /** empty/omitted = visible to manager tier and up; non-empty scopes to those staff roles */
  targetRoles?: string[];
}

export async function createNotification(input: CreateNotificationInput) {
  try {
    await db.notification.create({
      data: {
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        severity: input.severity ?? DEFAULT_SEVERITY[input.type],
        branchId: input.branchId ?? null,
        targetRoles: input.targetRoles ?? [],
      },
    });
    await bumpNotificationVersion();
  } catch (e) {
    // Non-fatal — never let notification failure break the main flow
    console.error("[notify] Failed to create notification:", e);
  }
}
