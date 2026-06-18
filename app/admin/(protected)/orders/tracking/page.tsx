// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminTrackingClient } from "@/components/admin/AdminTrackingClient";

export const metadata = { title: "Order Tracking | Fechi Organics Admin" };

export default function AdminTrackingPage() {
  return <AdminTrackingClient />;
}
