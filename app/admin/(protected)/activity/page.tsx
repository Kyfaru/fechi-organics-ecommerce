import { loadCallerContext } from "@/lib/require-permission";
import { Admin403 } from "@/components/admin/Admin403";
import { AdminActivityClient } from "@/components/admin/AdminActivityClient";

export const metadata = { title: "Activity Log | Fechi Organics Admin" };

export default async function ActivityPage() {
  // Stricter than the layout's staff:view resource check — only admin/
  // super_admin can see the full cross-branch activity trail (see
  // GET /api/admin/activity, which applies the same restriction).
  const caller = await loadCallerContext();
  const allowed = !caller.denied && (caller.isSuperAdmin || caller.role === "admin");
  if (!allowed) return <Admin403 />;

  return <AdminActivityClient />;
}
