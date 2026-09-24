import { Suspense } from "react";
import { AdminSecurityClient } from "@/components/admin/AdminSecurityClient";

export const metadata = { title: "Security | Fechi Organics Admin" };

export default function SecurityPage() {
  return (
    // AdminSecurityClient reads ?verify= via useSearchParams (to pulse the
    // channel a re-verify redirect points at) — that hook requires a
    // Suspense boundary in the App Router.
    <Suspense fallback={null}>
      <AdminSecurityClient />
    </Suspense>
  );
}
