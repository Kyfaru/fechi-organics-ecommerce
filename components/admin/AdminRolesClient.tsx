"use client";

/**
 * AdminRolesClient — Roles & Permissions page
 *
 * Read-only display of the real Better Auth access-control grants defined in
 * `lib/permissions.ts` (`statements` + `roles`, built via `createAccessControl`).
 *
 * There is no editor here on purpose: role → permission grants live as code
 * constants, not database rows. A live editor would need a separate DB-backed
 * override layer sitting on top of the code defaults, which is out of scope.
 * This component only reads and formats that data — it never writes anything.
 */

import { useMemo, useState } from "react";
import { Info, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { statements, roles, appResources, grantsFor, type RoleName } from "@/lib/permissions";

const RESOURCES = appResources;

const ROLE_ORDER = Object.keys(roles) as RoleName[];

/** snake_case -> Title Case, e.g. "contact_messages" -> "Contact Messages". */
function formatLabel(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function AdminRolesClient() {
  const [search, setSearch] = useState("");
  const [focusRole, setFocusRole] = useState<RoleName | "all">("all");

  const visibleResources = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return RESOURCES;
    return RESOURCES.filter((resource) => formatLabel(resource).toLowerCase().includes(q));
  }, [search]);

  const visibleRoles = focusRole === "all" ? ROLE_ORDER : [focusRole];

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader
        title="Roles & Permissions"
        breadcrumbs={[
          { label: "Staff", href: "/admin/staff" },
          { label: "Roles", href: "/admin/staff/roles" },
        ]}
        description="What each role can access across the admin panel"
      />

      <div className="px-6 pb-6">
        <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) overflow-hidden">
          {/* Note banner — tone matches the disclaimer in AdminStaffClient's role picker */}
          <div className="px-6 py-3 bg-(--gold-50) border-b border-(--gold-200) flex items-center gap-2">
            <Info size={14} className="text-(--gold-700) shrink-0" />
            <span className="font-dm text-[13px] text-(--gold-700)">
              Permissions for each role are fixed and defined in code (lib/permissions.ts) — this page is
              read-only and can&apos;t be edited here.
            </span>
          </div>

          {/* Controls: resource search + role focus filter (display only, no data mutation) */}
          <div className="px-6 py-4 border-b border-(--neutral-200) dark:border-(--dark-border) flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="relative w-full sm:w-64">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search resources…"
                className="w-full h-9 pl-8 pr-3 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) dark:bg-(--dark-bg) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-500)"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFocusRole("all")}
                className={`h-8 px-3 rounded-full font-dm text-[12px] font-medium transition-colors ${
                  focusRole === "all"
                    ? "bg-(--green-800) text-white"
                    : "bg-(--neutral-100) dark:bg-(--dark-bg) text-(--neutral-600) dark:text-(--dark-muted) hover:bg-(--neutral-200) dark:hover:bg-(--dark-border)"
                }`}
              >
                All roles
              </button>
              {ROLE_ORDER.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setFocusRole(role)}
                  className={`h-8 px-3 rounded-full font-dm text-[12px] font-medium transition-colors ${
                    focusRole === role
                      ? "bg-(--green-800) text-white"
                      : "bg-(--neutral-100) dark:bg-(--dark-bg) text-(--neutral-600) dark:text-(--dark-muted) hover:bg-(--neutral-200) dark:hover:bg-(--dark-border)"
                  }`}
                >
                  {formatLabel(role)}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg)">
                  <th className="sticky left-0 z-10 bg-(--neutral-50) dark:bg-(--dark-bg) px-6 py-3 text-left font-dm text-[11px] font-medium uppercase tracking-wider text-(--neutral-500) dark:text-(--dark-muted) w-56 min-w-56">
                    Resource
                  </th>
                  {visibleRoles.map((role) => (
                    <th
                      key={role}
                      className="px-4 py-3 text-left font-dm text-[11px] font-medium uppercase tracking-wider text-(--neutral-500) dark:text-(--dark-muted) min-w-[160px]"
                    >
                      {formatLabel(role)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleResources.map((resource, idx) => {
                  const rowBg =
                    idx % 2 === 0
                      ? "bg-white dark:bg-(--dark-surface)"
                      : "bg-(--neutral-50) dark:bg-(--dark-bg)/60";
                  return (
                    <tr key={resource} className={`border-b border-(--neutral-200) dark:border-(--dark-border) ${rowBg}`}>
                      <td className={`sticky left-0 z-10 px-6 py-3 font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) ${rowBg}`}>
                        {formatLabel(resource)}
                        <div className="font-dm text-[11px] font-normal text-(--neutral-400) dark:text-(--dark-muted) mt-0.5">
                          all actions: {statements[resource].join(", ")}
                        </div>
                      </td>
                      {visibleRoles.map((role) => {
                        const granted = grantsFor(role, resource);
                        return (
                          <td key={role} className="px-4 py-3 align-top">
                            {granted.length === 0 ? (
                              <span className="font-dm text-[13px] text-(--neutral-300) dark:text-(--dark-muted)/50">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {granted.map((action) => (
                                  <span
                                    key={action}
                                    className="px-1.5 py-0.5 rounded-[4px] bg-(--green-50) dark:bg-(--green-900)/40 font-dm text-[11px] font-medium text-(--green-700) dark:text-(--green-200) whitespace-nowrap"
                                  >
                                    {formatLabel(action)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {visibleResources.length === 0 && (
                  <tr>
                    <td
                      colSpan={visibleRoles.length + 1}
                      className="px-6 py-10 text-center font-dm text-[13px] text-(--neutral-400) dark:text-(--dark-muted)"
                    >
                      No resources match &ldquo;{search}&rdquo;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
