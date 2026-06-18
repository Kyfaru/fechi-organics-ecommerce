// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminProductQnAClient } from "@/components/admin/AdminProductQnAClient";

export const metadata = { title: "Q&A | Fechi Organics Admin" };

export default function AdminProductQnAPage() {
  return <AdminProductQnAClient />;
}
