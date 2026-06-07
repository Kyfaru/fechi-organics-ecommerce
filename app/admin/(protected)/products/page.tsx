// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminProductsClient } from "@/components/admin/AdminProductsClient";

export const metadata = { title: "Products | Fechi Organics Admin" };

export default function AdminProductsPage() {
  return <AdminProductsClient />;
}
