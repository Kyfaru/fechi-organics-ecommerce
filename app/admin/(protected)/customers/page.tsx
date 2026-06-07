// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminCustomersClient } from "@/components/admin/AdminCustomersClient";

export const metadata = { title: "Customers | Fechi Organics Admin" };

export default function AdminCustomersPage() {
  return <AdminCustomersClient />;
}
