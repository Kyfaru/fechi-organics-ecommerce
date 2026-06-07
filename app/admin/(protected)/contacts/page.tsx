// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminContactsClient } from "@/components/admin/AdminContactsClient";

export const metadata = {
  title: "Contact Messages | Fechi Organics Admin",
};

export default function AdminContactsPage() {
  return <AdminContactsClient />;
}
