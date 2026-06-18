// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminProductCategoriesClient } from "@/components/admin/AdminProductCategoriesClient";

export const metadata = { title: "Categories | Fechi Organics Admin" };

export default function AdminProductCategoriesPage() {
  return <AdminProductCategoriesClient />;
}
