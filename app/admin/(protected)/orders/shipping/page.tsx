// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminShippingClient } from "@/components/admin/AdminShippingClient";

export const metadata = { title: "Shipping Zones | Fechi Organics Admin" };

export default function AdminShippingPage() {
  return <AdminShippingClient />;
}
