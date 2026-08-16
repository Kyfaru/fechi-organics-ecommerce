import type { NotificationType } from "@prisma/client";
import { NOTIFICATION_TYPE_RESOURCE } from "@/lib/notifications/type-resource-map";
import type { AppResource } from "@/lib/permissions";

// Human-facing grouping of NotificationType for the "Category" filter — built
// directly from NOTIFICATION_TYPE_RESOURCE so there's one source of truth for
// "what is this notification type about". `resources: []` (System) means
// always visible regardless of role, matching the `null` resource types.
interface Category {
  id: string;
  label: string;
  resources: AppResource[];
  types: NotificationType[];
}

const CATEGORY_RESOURCES: { id: string; label: string; resources: AppResource[] }[] = [
  { id: "orders_payments", label: "Orders & Payments", resources: ["orders", "finance"] },
  { id: "inventory", label: "Inventory & Products", resources: ["products", "inventory"] },
  { id: "staff_approvals", label: "Staff & Approvals", resources: ["staff", "approvals"] },
  { id: "support", label: "Tickets & Support", resources: ["tickets", "contact_messages"] },
  { id: "delivery", label: "Delivery", resources: ["delivery"] },
  { id: "system", label: "System", resources: [] },
];

function typesForResources(resources: AppResource[]): NotificationType[] {
  return (Object.keys(NOTIFICATION_TYPE_RESOURCE) as NotificationType[]).filter((type) => {
    const resource = NOTIFICATION_TYPE_RESOURCE[type];
    if (resources.length === 0) return resource === null; // System bucket
    return resource !== null && resources.includes(resource);
  });
}

export const NOTIFICATION_CATEGORIES: Category[] = CATEGORY_RESOURCES.map((c) => ({
  id: c.id,
  label: c.label,
  resources: c.resources,
  types: typesForResources(c.resources),
}));

export function typesForCategory(categoryId: string): NotificationType[] {
  return NOTIFICATION_CATEGORIES.find((c) => c.id === categoryId)?.types ?? [];
}
