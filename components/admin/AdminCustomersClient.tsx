"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Customer = {
  id: string;
  companyId: string | null;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  role: "customer" | "admin";
  createdAt: string;
  loginCount: number;
};

type ApiResponse = {
  ok: boolean;
  data: { users: Customer[] };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Skeleton row — shown during initial load
// ---------------------------------------------------------------------------
function SkeletonRow() {
  return (
    <tr className="border-t border-[#f0f0f0]">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="animate-pulse h-4 bg-[#e8fce3] rounded" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------
function RoleBadge({ role }: { role: "customer" | "admin" }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-[11px] font-semibold capitalize",
        role === "admin"
          ? "bg-[#045a03] text-white"
          : "bg-[#e8fce3] text-[#27731e]",
      ].join(" ")}
    >
      {role}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------
export function AdminCustomersClient() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  // Track which row's mutation is in flight so we can show a per-row spinner
  const [pendingId, setPendingId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data fetch
  // -------------------------------------------------------------------------
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["admin-customers"],
    queryFn: () => fetch("/api/admin/customers").then((r) => r.json()),
    staleTime: 30_000,
  });

  const customers = data?.data?.users ?? [];

  // Client-side search — filters by name OR email (case-insensitive)
  const filtered = search.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase())
      )
    : customers;

  // -------------------------------------------------------------------------
  // Role toggle mutation
  // -------------------------------------------------------------------------
  const toggleRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "customer" | "admin" }) => {
      const res = await fetch("/api/admin/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role }),
      });
      return res.json();
    },
    onMutate: ({ id }) => {
      setPendingId(id);
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Role updated");
        qc.invalidateQueries({ queryKey: ["admin-customers"] });
      } else {
        toast.error(result.error?.message ?? "Failed to update role");
      }
    },
    onError: () => {
      toast.error("Failed to update role");
    },
    onSettled: () => {
      setPendingId(null);
    },
  });

  function handleRoleToggle(customer: Customer) {
    const nextRole = customer.role === "admin" ? "customer" : "admin";
    toggleRole.mutate({ id: customer.id, role: nextRole });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-[#e2e2e2] bg-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-heading font-semibold text-[#1a1c1c] text-[24px] leading-tight">
            Customers
          </h1>
          {/* Total count badge */}
          {!isLoading && (
            <span className="bg-[#e8fce3] text-[#27731e] font-body font-semibold text-[12px] px-2.5 py-0.5 rounded-full">
              {customers.length}
            </span>
          )}
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-[260px]">
          <Icon
            icon="mdi:magnify"
            width={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1a1] pointer-events-none"
          />
          <input
            type="search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#f9f9f9] border border-[#c0cab8] rounded-full font-body text-[14px] text-[#1a1c1c] placeholder-[#a1a1a1] focus:outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] transition-colors"
          />
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">

        {/* Error state */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Icon icon="mdi:alert-circle-outline" width={48} className="text-[#e53935] mb-3" />
            <p className="font-body text-[#40493c] text-[15px]">
              Could not load customers. Please refresh the page.
            </p>
          </div>
        )}

        {/* Table card */}
        {!isError && (
          <div className="bg-white rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                {/* Table header */}
                <thead>
                  <tr className="bg-[#f9f9f9] border-b border-[#eeeeee]">
                    {[
                      "Company ID",
                      "Name",
                      "Email",
                      "Country",
                      "Role",
                      "Logins",
                      "Joined",
                      "Actions",
                    ].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left font-body font-semibold text-[#40493c] text-[12px] uppercase tracking-[0.6px] whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {/* Loading skeleton — 5 placeholder rows */}
                  {isLoading &&
                    Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

                  {/* Empty state */}
                  {!isLoading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Icon
                            icon="mdi:account-search-outline"
                            width={52}
                            className="text-[#c0cab8]"
                          />
                          <p className="font-body text-[#40493c] text-[15px]">
                            {search.trim()
                              ? `No customers match "${search}"`
                              : "No customers yet."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Data rows */}
                  {!isLoading &&
                    filtered.map((customer) => {
                      const isRowPending = pendingId === customer.id;

                      return (
                        <tr
                          key={customer.id}
                          className="border-t border-[#f3f3f3] hover:bg-[#fafcf9] transition-colors"
                        >
                          {/* Company ID */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-[12px] text-[#40493c]">
                              {customer.companyId ?? "—"}
                            </span>
                          </td>

                          {/* Name */}
                          <td className="px-4 py-3">
                            <span className="font-body font-semibold text-[#1a1c1c] text-[14px] whitespace-nowrap">
                              {customer.name}
                            </span>
                          </td>

                          {/* Email */}
                          <td className="px-4 py-3 max-w-[220px]">
                            <span
                              className="font-body text-[#40493c] text-[13px] truncate block"
                              title={customer.email}
                            >
                              {customer.email}
                            </span>
                          </td>

                          {/* Country */}
                          <td className="px-4 py-3">
                            <span className="font-body text-[#40493c] text-[13px] whitespace-nowrap">
                              {customer.country ?? "—"}
                            </span>
                          </td>

                          {/* Role badge */}
                          <td className="px-4 py-3">
                            <RoleBadge role={customer.role} />
                          </td>

                          {/* Login count */}
                          <td className="px-4 py-3">
                            <span className="font-body text-[#40493c] text-[13px]">
                              {customer.loginCount}
                            </span>
                          </td>

                          {/* Joined date */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-body text-[#40493c] text-[13px]">
                              {formatDate(customer.createdAt)}
                            </span>
                          </td>

                          {/* Toggle role action */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleRoleToggle(customer)}
                              disabled={isRowPending}
                              aria-label={
                                customer.role === "admin"
                                  ? "Make customer"
                                  : "Make admin"
                              }
                              className="inline-flex items-center justify-center gap-1.5 border border-[#c0cab8] rounded-full px-3 py-1 font-body text-[12px] text-[#40493c] hover:border-[#27731e] hover:text-[#27731e] disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                            >
                              {isRowPending ? (
                                <Spinner size={12} />
                              ) : customer.role === "admin" ? (
                                "Make Customer"
                              ) : (
                                "Make Admin"
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer count */}
        {!isLoading && !isError && (
          <p className="font-body text-[#a1a1a1] text-[13px] mt-4 text-right">
            {filtered.length === customers.length
              ? `${customers.length} customer${customers.length !== 1 ? "s" : ""} total`
              : `Showing ${filtered.length} of ${customers.length} customer${customers.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>
    </div>
  );
}
