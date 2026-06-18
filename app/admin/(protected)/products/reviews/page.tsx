// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminProductReviewsClient } from "@/components/admin/AdminProductReviewsClient";

export const metadata = { title: "Reviews | Fechi Organics Admin" };

export default function AdminProductReviewsPage() {
  return <AdminProductReviewsClient />;
}
