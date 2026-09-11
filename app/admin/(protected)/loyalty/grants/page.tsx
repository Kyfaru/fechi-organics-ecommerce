import { AdminLoyaltyGrantsClient } from "@/components/admin/AdminLoyaltyGrantsClient";

export const metadata = { title: "Points Grants | Fechi Admin" };

export default function AdminLoyaltyGrantsPage() {
  // The API gates on isSuperAdmin directly — the `loyalty` resource is also
  // granted to admin/manager/marketing, none of whom may mint points.
  return <AdminLoyaltyGrantsClient />;
}
