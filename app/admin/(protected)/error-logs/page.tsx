import { Suspense } from "react";
import { loadCallerContext } from "@/lib/require-permission";
import { Admin403 } from "@/components/admin/Admin403";
import { AdminErrorLogsClient } from "@/components/admin/AdminErrorLogsClient";

export const metadata = { title: "Error Logs | Fechi Organics Admin" };

export default async function ErrorLogsPage() {
  // Same restriction as /admin/activity — only admin/super_admin can see the
  // full cross-branch error trail (mirrored in GET /api/admin/error-logs).
  const caller = await loadCallerContext();
  const allowed = !caller.denied && (caller.isSuperAdmin || caller.role === "admin");
  if (!allowed) return <Admin403 />;

  // AdminErrorLogsClient reads ?highlight= via useSearchParams, which
  // requires a Suspense boundary (see app/admin/reset-password/page.tsx).
  return (
    <Suspense>
      <AdminErrorLogsClient />
    </Suspense>
  );
}
