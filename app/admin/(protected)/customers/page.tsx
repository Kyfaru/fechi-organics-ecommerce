// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { Suspense } from "react";
import { AdminCustomersClient } from "@/components/admin/AdminCustomersClient";

export const metadata = { title: "Customers | Fechi Organics Admin" };

export default function AdminCustomersPage() {
  // The client reads ?customer= and ?q= via useSearchParams, which needs a
  // Suspense boundary inside a server component.
  return (
    <Suspense fallback={null}>
      <AdminCustomersClient />
    </Suspense>
  );
}
