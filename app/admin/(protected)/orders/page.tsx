// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminOrdersClient } from "@/components/admin/AdminOrdersClient";

export const metadata = { title: "Orders | Fechi Organics Admin" };

export default function AdminOrdersPage() {
  return <AdminOrdersClient />;
}
