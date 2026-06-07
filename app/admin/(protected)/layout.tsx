import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Spinner } from "@/components/ui/spinner";

// Server component — no "use client"
//
// The layout body is intentionally SYNCHRONOUS so the static shell streams
// immediately. With experimental.cacheComponents enabled, any dynamic data
// read (headers/db) must resolve inside a <Suspense> boundary — that work
// lives in <AdminGuard> below, not in the layout body.
//
// This layout only wraps routes under /admin/(protected)/* — the /admin/login
// page sits outside this group and is NOT behind the guard.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f0f4ef]">
      {/* Sidebar renders the fixed desktop nav + mobile top bar + mobile drawer */}
      <AdminSidebar />

      {/* Main content area — offset by sidebar width on desktop */}
      <main className="md:ml-[240px] min-h-screen">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
              <Spinner size={28} />
            </div>
          }
        >
          <AdminGuard>{children}</AdminGuard>
        </Suspense>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------
// Auth + role guard
// All admin pages under /admin/(protected)/* inherit this protection.
// Children only render once the guard passes, so no admin content
// leaks to unauthorized users. Individual pages do NOT need their own
// auth checks.
// ------------------------------------------------------------------
async function AdminGuard({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/admin/login");

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") redirect("/");

  return <>{children}</>;
}
