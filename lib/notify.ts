import { db } from "@/lib/db";
import { bumpNotificationVersion } from "@/lib/notification-channel";
import { sendAdminNotificationEmail } from "@/lib/email";
import { emailShell, emailSection } from "@/lib/email-template";
import type { NotificationSeverity, NotificationType } from "@prisma/client";

// Default severity per type at creation time — still overridable per-call
// (e.g. a VIP order might warrant CRITICAL even though ORDER_NEW defaults to
// WARNING). Design doc Section 4.
const DEFAULT_SEVERITY: Record<NotificationType, NotificationSeverity> = {
  ORDER_NEW: "WARNING",
  ORDER_FAILED: "CRITICAL",
  ORDER_CANCELLED: "CRITICAL",
  PAYMENT_ERROR: "CRITICAL",
  PRODUCT_ADDED: "INFO",
  PRODUCT_DELETED: "WARNING",
  LOW_STOCK: "WARNING",
  STAFF_ADDED: "INFO",
  STAFF_REMOVED: "INFO",
  TICKET_NEW: "WARNING",
  TICKET_RESPONSE: "INFO",
  CONTACT_INQUIRY: "INFO",
  DELIVERY_ZONE_REQUEST: "INFO",
  ADMIN_ADDED: "INFO",
  SYSTEM_ALERT: "CRITICAL",
  APPROVAL_REQUESTED: "WARNING",
  APPROVAL_DECIDED: "INFO",
  EXPORT_READY: "INFO",
  LOYALTY_GRANT_REQUESTED: "WARNING",
  LOYALTY_GRANT_RELEASED: "INFO",
  LOYALTY_ABUSE_FLAG: "WARNING",
  LOYALTY_LEDGER_BREACH: "CRITICAL",
};

// Maps a NotificationType to the systemConfig boolean key (Settings →
// Notifications tab) that gates emailing it. Only covers types with a real,
// existing createNotification() call site matching one of the Notifications
// tab's toggles — "Order shipped", "New customer signed up", and "Daily
// digest" have no corresponding trigger anywhere in the codebase yet (no
// ORDER_SHIPPED/NEW_CUSTOMER notification type, no digest cron job), so
// those toggles stay UI-only until that infrastructure exists — wiring them
// here would silently do nothing, which is worse than the toggle being
// honest about not being wired up.
const EMAIL_SETTING_KEY: Partial<Record<NotificationType, string>> = {
  ORDER_NEW: "notif_new_order",
  LOW_STOCK: "notif_low_stock",
  STAFF_ADDED: "notif_invite_accepted",
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
    return;
  }

  // Best-effort email, gated by the matching Settings → Notifications
  // toggle. Runs after the in-app notification is safely written, and never
  // throws back into the caller.
  await sendNotificationEmail(input).catch((e) => {
    console.error("[notify] Failed to send notification email:", e);
  });
}

async function sendNotificationEmail(input: CreateNotificationInput): Promise<void> {
  const settingKey = EMAIL_SETTING_KEY[input.type];
  if (!settingKey) return;

  const config = await db.systemConfig.findUnique({ where: { key: settingKey } });
  if (config?.value !== true) return;

  const recipients = await resolveEmailRecipients(input.branchId ?? null);
  if (recipients.length === 0) return;

  const html = emailShell({
    title: input.title,
    sectionsHtml: emailSection(`
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;">${input.title}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;">${input.body}</p>
    `),
  });

  await sendAdminNotificationEmail({ to: recipients, subject: input.title, html });
}

/** Super admins always get notification emails; branch-scoped admins only for their own branch. */
async function resolveEmailRecipients(branchId: string | null): Promise<string[]> {
  const [superAdmins, branchAdmins] = await Promise.all([
    db.adminProfile.findMany({
      where: { isSuperAdmin: true, isActive: true },
      select: { user: { select: { email: true } } },
    }),
    branchId
      ? db.adminProfile.findMany({
          where: { branchId, isActive: true, isSuperAdmin: false },
          select: { user: { select: { email: true } } },
        })
      : Promise.resolve([]),
  ]);

  return [...new Set([...superAdmins, ...branchAdmins].map((p) => p.user.email).filter(Boolean))];
}
