import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminFooter } from "@/components/admin/AdminFooter";
import { PrelineInit } from "@/components/admin/PrelineInit";
import { Spinner } from "@/components/ui/spinner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PrelineInit />
      <AdminSidebar />
      <main className="md:ml-[var(--sidebar-w,264px)] min-h-screen flex flex-col transition-all duration-200">
        <AdminHeader />
        <div className="flex-1">
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <Spinner size={28} />
              </div>
            }
          >
            <AdminGuard>{children}</AdminGuard>
          </Suspense>
        </div>
        <AdminFooter />
      </main>
    </div>
  );
}

async function AdminGuard({ children }: { children: React.ReactNode }) {
  if (process.env.ADMIN_DEV_BYPASS === "true") return <>{children}</>;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/admin/login");

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") redirect("/");

  // Force password change on first login
  if (user.mustChangePassword) redirect("/admin/change-password");

  return <>{children}</>;
}
