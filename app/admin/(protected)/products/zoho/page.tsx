// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
// Nested under /admin/products/... so it inherits that route's RBAC guard.
import { AdminZohoStagedItemsClient } from "@/components/admin/AdminZohoStagedItemsClient";

export const metadata = { title: "Zoho Products | Fechi Organics Admin" };

export default function AdminZohoStagedItemsPage() {
  return <AdminZohoStagedItemsClient status="PENDING" />;
}
