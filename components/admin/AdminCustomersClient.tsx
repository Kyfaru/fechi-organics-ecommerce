"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users, UserCheck, UserPlus, Ban, Search, MoreHorizontal,
  Eye, Edit2, ShieldOff, Shield, MessageSquare, Ticket,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatCard } from "@/components/admin/ui/StatCard";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { Drawer } from "@/components/admin/ui/Drawer";
import { EmptyState } from "@/components/admin/ui/EmptyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LoyaltyPoints = { tier: string } | null;

type Customer = {
  id: string;
  companyId: string | null;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  role: "client" | "admin";
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  loginCount: number;
  _count: { orders: number };
  loyaltyPoints: LoyaltyPoints;
};

type CustomerDetail = Customer & {
  firstName: string | null;
  lastName: string | null;
  updatedAt: string;
};

type CustomerOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  totalKes: number;
  createdAt: string;
  _count: { items: number };
};

type Stats = {
  total: number;
  active: number;
  newThisMonth: number;
  banned: number;
};

type ApiResponse = {
  ok: boolean;
  data: { users: Customer[]; stats: Stats };
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

function formatKes(amountCents: number) {
  return `KES ${(amountCents / 100).toLocaleString("en-KE")}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Avatar circle — green bg with white initials
// ---------------------------------------------------------------------------
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="rounded-full bg-(--green-800) text-white flex items-center justify-center font-dm font-semibold shrink-0"
    >
      {initials(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pill filter button
// ---------------------------------------------------------------------------
function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "h-8 px-4 rounded-full font-dm text-[13px] font-medium transition-colors",
        active
          ? "bg-(--green-800) text-white"
          : "bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) text-(--neutral-700) dark:text-(--dark-text) hover:border-(--neutral-400)",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Actions dropdown
// ---------------------------------------------------------------------------
function ActionsMenu({
  customer,
  onView,
  onBanToggle,
}: {
  customer: Customer;
  onView: () => void;
  onBanToggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="w-8 h-8 flex items-center justify-center rounded-[6px] text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-44 bg-white dark:bg-(--dark-surface) rounded-[10px] shadow-(--e2) border border-(--neutral-200) dark:border-(--dark-border) py-1 overflow-hidden">
            <button
              onClick={() => { setOpen(false); onView(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text) hover:bg-(--neutral-50) dark:hover:bg-(--dark-border)"
            >
              <Eye size={14} /> View Profile
            </button>
            <div className="border-t border-(--neutral-200) dark:border-(--dark-border) my-1" />
            <button
              onClick={() => { setOpen(false); onBanToggle(); }}
              className={[
                "w-full flex items-center gap-2.5 px-3 py-2 font-dm text-[13px]",
                customer.banned
                  ? "text-(--success) hover:bg-(--green-50)"
                  : "text-(--danger) hover:bg-(--danger-bg)",
              ].join(" ")}
            >
              {customer.banned ? (
                <><Shield size={14} /> Unban Customer</>
              ) : (
                <><ShieldOff size={14} /> Ban Customer</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer Profile Drawer — 3 tabs
// ---------------------------------------------------------------------------
function CustomerDrawer({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"orders" | "info" | "notes">("orders");
  const [note, setNote] = useState("");

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["admin-customer-detail", customerId],
    queryFn: () =>
      fetch(`/api/admin/customers/${customerId}`).then((r) => r.json()),
    enabled: !!customerId,
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["admin-customer-orders", customerId],
    queryFn: () =>
      fetch(`/api/admin/customers/${customerId}/orders`).then((r) => r.json()),
    enabled: !!customerId && tab === "orders",
  });

  const customer: CustomerDetail | null = detailData?.data?.user ?? null;
  const orders: CustomerOrder[] = ordersData?.data?.orders ?? [];

  const TABS = [
    { key: "orders" as const, label: "Orders" },
    { key: "info" as const, label: "Info" },
    { key: "notes" as const, label: "Notes" },
  ];

  return (
    <Drawer
      open={!!customerId}
      onClose={onClose}
      title={customer?.name ?? "Customer Profile"}
      width={640}
    >
      {detailLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-(--neutral-100) dark:bg-(--dark-border) rounded-[8px] animate-pulse" />
          ))}
        </div>
      ) : !customer ? (
        <EmptyState icon={Users} title="Not found" description="Customer details could not be loaded." />
      ) : (
        <>
          {/* Customer header */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-(--neutral-200) dark:border-(--dark-border)">
            <Avatar name={customer.name} size={56} />
            <div>
              <div className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                {customer.name}
              </div>
              <div className="font-dm text-[14px] text-(--neutral-500) dark:text-(--dark-muted)">
                {customer.email}
              </div>
              <div className="mt-1">
                <StatusPill status={customer.banned ? "banned" : "active"} />
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-6 bg-(--neutral-100) dark:bg-(--dark-border) rounded-[10px] p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  "flex-1 h-8 rounded-[8px] font-dm text-[13px] font-medium transition-colors",
                  tab === t.key
                    ? "bg-white dark:bg-(--dark-surface) text-(--neutral-900) dark:text-(--dark-text) shadow-(--e1)"
                    : "text-(--neutral-500) dark:text-(--dark-muted) hover:text-(--neutral-700)",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Orders */}
          {tab === "orders" && (
            <div>
              {ordersLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 bg-(--neutral-100) dark:bg-(--dark-border) rounded-[8px] animate-pulse" />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No orders yet"
                  description="This customer has not placed any orders."
                />
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-3 rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg)"
                    >
                      <div>
                        <div className="font-dm text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text) font-mono">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </div>
                        <div className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted) mt-0.5">
                          {order._count.items} item{order._count.items !== 1 ? "s" : ""} &middot; {formatDate(order.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusPill status={order.status.toLowerCase()} />
                        <span className="font-dm text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                          {formatKes(order.totalKes)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Info */}
          {tab === "info" && (
            <div className="space-y-4">
              {[
                { label: "Full Name", value: customer.name },
                { label: "Email", value: customer.email },
                { label: "Phone", value: customer.phone ?? "—" },
                { label: "Country", value: customer.country ?? "—" },
                { label: "City", value: customer.city ?? "—" },
                { label: "Role", value: customer.role },
                { label: "Member Since", value: formatDate(customer.createdAt) },
                { label: "Loyalty Tier", value: customer.loyaltyPoints?.tier ?? "None" },
                { label: "Total Orders", value: String(customer._count.orders) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start py-2 border-b border-(--neutral-200) dark:border-(--dark-border) last:border-0">
                  <span className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">{label}</span>
                  <span className="font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) font-medium text-right max-w-[200px]">
                    {value}
                  </span>
                </div>
              ))}
              {customer.banned && customer.banReason && (
                <div className="mt-4 p-3 rounded-[10px] bg-(--danger-bg) border border-(--danger)">
                  <div className="font-dm text-[12px] font-semibold text-(--danger) mb-1">Ban Reason</div>
                  <div className="font-dm text-[13px] text-(--danger)">{customer.banReason}</div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Notes */}
          {tab === "notes" && (
            <div className="space-y-4">
              <p className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
                Internal notes visible only to admins.
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note about this customer…"
                rows={6}
                className="w-full rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) px-4 py-3 font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) placeholder:text-(--neutral-400) resize-none focus:outline-none focus:border-(--green-800) transition-colors"
              />
              <button
                onClick={() => toast.info("Note saved (UI only — connect to adminProfile when ready)")}
                className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:opacity-90 transition-opacity"
              >
                Save Note
              </button>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminCustomersClient() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-customers"],
    queryFn: () => fetch("/api/admin/customers").then((r) => r.json()),
    staleTime: 30_000,
  });

  const allCustomers = data?.data?.users ?? [];
  const stats = data?.data?.stats;

  // Client-side filter on top of server data (server already handles DB-level filter;
  // this handles additional text search without a round-trip)
  const filtered = allCustomers.filter((c) => {
    if (statusFilter === "banned" && !c.banned) return false;
    if (statusFilter === "active" && c.banned) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "orders") return b._count.orders - a._count.orders;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const banMutation = useMutation({
    mutationFn: async ({ id, banned }: { id: string; banned: boolean }) => {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned }),
      });
      return res.json();
    },
    onSuccess: (result, { banned }) => {
      if (result.ok) {
        toast.success(banned ? "Customer banned" : "Customer unbanned");
        qc.invalidateQueries({ queryKey: ["admin-customers"] });
      } else {
        toast.error(result.error?.message ?? "Action failed");
      }
    },
    onError: () => toast.error("Action failed"),
  });

  const columns = [
    {
      key: "customer",
      label: "Customer",
      render: (_: unknown, row: Record<string, unknown>) => {
        const c = row as unknown as Customer;
        return (
          <div className="flex items-center gap-3">
            <Avatar name={c.name} size={32} />
            <div>
              <div className="font-dm text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                {c.name}
              </div>
              <div className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted)">
                {c.email}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "country",
      label: "Country",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-text)">
          {(row as unknown as Customer).country ?? "—"}
        </span>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-text)">
          {(row as unknown as Customer).phone ?? "—"}
        </span>
      ),
    },
    {
      key: "orders",
      label: "Orders",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-text)">
          {(row as unknown as Customer)._count.orders}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const c = row as unknown as Customer;
        return <StatusPill status={c.banned ? "banned" : "active"} />;
      },
    },
    {
      key: "createdAt",
      label: "Joined",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
          {formatDate((row as unknown as Customer).createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const c = row as unknown as Customer;
        return (
          <ActionsMenu
            customer={c}
            onView={() => setActiveCustomerId(c.id)}
            onBanToggle={() =>
              banMutation.mutate({ id: c.id, banned: !c.banned })
            }
          />
        );
      },
    },
  ];

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Customers"
        description="Manage your customer accounts"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Customers", href: "/admin/customers" },
        ]}
        action={
          <Link
            href="/admin/customers/tickets"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:opacity-90 transition-opacity"
          >
            <Ticket size={16} />
            Support Tickets
          </Link>
        }
      />

      <div className="px-6 pb-8 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            eyebrow="Total Customers"
            value={isLoading ? "—" : String(stats?.total ?? 0)}
            icon={Users}
          />
          <StatCard
            eyebrow="Active (90d)"
            value={isLoading ? "—" : String(stats?.active ?? 0)}
            icon={UserCheck}
          />
          <StatCard
            eyebrow="New This Month"
            value={isLoading ? "—" : String(stats?.newThisMonth ?? 0)}
            icon={UserPlus}
          />
          <StatCard
            eyebrow="Banned"
            value={isLoading ? "—" : String(stats?.banned ?? 0)}
            icon={Ban}
          />
        </div>

        {/* Filter toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-[280px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none"
            />
            <input
              type="search"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-10 bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) rounded-full font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) placeholder:text-(--neutral-400) focus:outline-none focus:border-(--green-800) transition-colors"
            />
          </div>

          {/* Status filter */}
          <div className="flex gap-1.5">
            {["all", "active", "banned"].map((s) => (
              <FilterPill
                key={s}
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
              />
            ))}
          </div>

          {/* Sort */}
          <div className="relative ml-auto">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-10 pl-4 pr-8 bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) rounded-[8px] font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-text) appearance-none focus:outline-none focus:border-(--green-800) cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="name">Name A–Z</option>
              <option value="orders">Most Orders</option>
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none"
            />
          </div>
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={sorted as unknown as Record<string, unknown>[]}
          loading={isLoading}
          onRowClick={(row) =>
            setActiveCustomerId((row as unknown as Customer).id)
          }
          emptyTitle="No customers found"
          emptyDescription={
            search ? `No customers match "${search}"` : "No customers yet."
          }
        />

        {!isLoading && (
          <p className="font-dm text-[13px] text-(--neutral-400) text-right">
            {sorted.length === allCustomers.length
              ? `${allCustomers.length} customer${allCustomers.length !== 1 ? "s" : ""} total`
              : `Showing ${sorted.length} of ${allCustomers.length}`}
          </p>
        )}
      </div>

      {/* Customer profile drawer */}
      <CustomerDrawer
        customerId={activeCustomerId}
        onClose={() => setActiveCustomerId(null)}
      />
    </div>
  );
}
