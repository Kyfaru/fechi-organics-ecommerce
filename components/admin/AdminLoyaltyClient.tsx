"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart, Star, Award, Edit2, Crown } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { EmptyState } from "@/components/admin/ui/EmptyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LoyaltyTier = {
  id: string;
  name: string;
  minSpend: number;
  multiplier: number;
  benefits: string[];
  color: string;
};

type CustomerPoints = {
  id: string;
  points: number;
  tier: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    _count: { orders: number };
  };
};

type ApiResponse = {
  ok: boolean;
  data: { tiers: LoyaltyTier[]; topCustomers: CustomerPoints[] };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Tier icon — bronze/silver/gold mapped to icons
function TierIcon({ tier }: { tier: string }) {
  const t = tier.toLowerCase();
  if (t === "gold" || t === "platinum")
    return <Crown size={24} className="text-yellow-500" />;
  if (t === "silver") return <Award size={24} className="text-slate-400" />;
  return <Heart size={24} className="text-amber-700" />;
}

// ---------------------------------------------------------------------------
// Tier card
// ---------------------------------------------------------------------------
function TierCard({ tier }: { tier: LoyaltyTier }) {
  const [editing, setEditing] = useState(false);

  // Derive a safe tailwind-compatible header bg from the tier color field.
  // The color field can be a CSS hex value — we apply it via inline style.
  const headerStyle = { backgroundColor: tier.color || "#27731e" };

  return (
    <div className="bg-white dark:bg-[--dark-surface] rounded-[16px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] overflow-hidden">
      {/* Colored header band */}
      <div style={headerStyle} className="px-6 py-5">
        <div className="flex items-center justify-between">
          <TierIcon tier={tier.name} />
          <button
            onClick={() => setEditing((e) => !e)}
            className="w-8 h-8 flex items-center justify-center rounded-[6px] bg-white/20 text-white hover:bg-white/30 transition-colors"
            title="Edit tier"
          >
            <Edit2 size={14} />
          </button>
        </div>
        <h3 className="font-syne text-[22px] font-bold text-white mt-3">
          {tier.name}
        </h3>
        <p className="font-dm text-[13px] text-white/70 mt-1">
          Minimum spend: {formatKes(tier.minSpend)}
        </p>
      </div>

      {/* Body */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Star size={14} className="text-[--gold-500]" />
          <span className="font-dm text-[13px] font-semibold text-[--neutral-700] dark:text-[--dark-text]">
            {tier.multiplier}x points multiplier
          </span>
        </div>

        {editing ? (
          <div className="p-4 rounded-[10px] bg-[--neutral-50] dark:bg-[--dark-bg] border border-[--neutral-200] dark:border-[--dark-border]">
            <p className="font-dm text-[13px] text-[--neutral-500] dark:text-[--dark-muted]">
              Tier editing UI — connect to a PATCH /api/admin/loyalty/tiers/[id] endpoint when needed.
            </p>
            <button
              onClick={() => setEditing(false)}
              className="mt-3 h-8 px-4 rounded-[6px] border border-[--neutral-200] dark:border-[--dark-border] font-dm text-[13px] text-[--neutral-700] dark:text-[--dark-text] hover:bg-[--neutral-100] transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {tier.benefits.length === 0 ? (
              <li className="font-dm text-[13px] text-[--neutral-400]">No benefits listed yet.</li>
            ) : (
              tier.benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[--green-800] mt-2 shrink-0" />
                  <span className="font-dm text-[14px] text-[--neutral-700] dark:text-[--dark-text]">{b}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminLoyaltyClient() {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-loyalty"],
    queryFn: () => fetch("/api/admin/loyalty").then((r) => r.json()),
    staleTime: 60_000,
  });

  const tiers = data?.data?.tiers ?? [];
  const topCustomers = data?.data?.topCustomers ?? [];

  const tableColumns = [
    {
      key: "customer",
      label: "Customer",
      render: (_: unknown, row: Record<string, unknown>) => {
        const cp = row as unknown as CustomerPoints;
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[--green-800] text-white flex items-center justify-center font-dm font-semibold text-[12px] shrink-0">
              {initials(cp.user.name)}
            </div>
            <div>
              <div className="font-dm text-[14px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">
                {cp.user.name}
              </div>
              <div className="font-dm text-[12px] text-[--neutral-500] dark:text-[--dark-muted]">
                {cp.user.email}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "points",
      label: "Points",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[14px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">
          {(row as unknown as CustomerPoints).points.toLocaleString()}
        </span>
      ),
    },
    {
      key: "tier",
      label: "Tier",
      render: (_: unknown, row: Record<string, unknown>) => (
        <StatusPill status={(row as unknown as CustomerPoints).tier.toLowerCase()} />
      ),
    },
    {
      key: "orders",
      label: "Orders",
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[14px] text-[--neutral-700] dark:text-[--dark-text]">
          {(row as unknown as CustomerPoints).user._count.orders}
        </span>
      ),
    },
    {
      key: "updatedAt",
      label: "Last Updated",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[13px] text-[--neutral-500] dark:text-[--dark-muted]">
          {formatDate((row as unknown as CustomerPoints).updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Loyalty Program"
        description="Manage tiers, multipliers, and customer points"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Customers", href: "/admin/customers" },
          { label: "Loyalty", href: "/admin/customers/loyalty" },
        ]}
      />

      <div className="px-6 pb-8 space-y-8">
        {/* Tier cards */}
        <div>
          <h2 className="font-syne text-[18px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-4">
            Tiers
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-64 bg-[--neutral-100] dark:bg-[--dark-border] rounded-[16px] animate-pulse" />
              ))}
            </div>
          ) : tiers.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No tiers configured"
              description="Run the seed script or create loyalty tiers via the database."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tiers.map((tier) => (
                <TierCard key={tier.id} tier={tier} />
              ))}
            </div>
          )}
        </div>

        {/* Customer points table */}
        <div>
          <h2 className="font-syne text-[18px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-4">
            Top Customers by Points
          </h2>
          <DataTable
            columns={tableColumns}
            data={topCustomers as unknown as Record<string, unknown>[]}
            loading={isLoading}
            emptyTitle="No loyalty data"
            emptyDescription="No customers have earned points yet."
          />
        </div>
      </div>
    </div>
  );
}
