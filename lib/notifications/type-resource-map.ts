import type { NotificationType } from "@prisma/client";
import type { AppResource } from "@/lib/permissions";

// Maps each notification type to the AppResource it's "about" — the resource
// a role must have view access to before it's allowed to see that type of
// notification. `null` means always visible regardless of role (SYSTEM_ALERT).
//
// Kept as an exhaustive Record over the real Prisma `NotificationType` enum
// (same forcing-function pattern as `DEFAULT_SEVERITY` in lib/notify.ts) so
// the build breaks if a new NotificationType is added without updating this
// map.
export const NOTIFICATION_TYPE_RESOURCE: Record<NotificationType, AppResource | null> = {
  ORDER_NEW: "orders",
  ORDER_FAILED: "orders",
  PAYMENT_ERROR: "finance",
  PRODUCT_ADDED: "products",
  PRODUCT_DELETED: "products",
  LOW_STOCK: "inventory",
  STAFF_ADDED: "staff",
  STAFF_REMOVED: "staff",
  ADMIN_ADDED: "staff",
  TICKET_NEW: "tickets",
  TICKET_RESPONSE: "tickets",
  CONTACT_INQUIRY: "contact_messages",
  DELIVERY_ZONE_REQUEST: "delivery",
  SYSTEM_ALERT: null,
  APPROVAL_REQUESTED: "approvals",
  // null, not "approvals" — the requester (who by definition doesn't hold
  // the approvals permission) needs to see the outcome of their own
  // request. The notification system has no per-user targeting, so this is
  // visible to everyone rather than hidden from the one person who needs it.
  APPROVAL_DECIDED: null,
};
