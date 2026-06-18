"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, Pencil, Check, X, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatCard } from "@/components/admin/ui/StatCard";

// ── Types ────────────────────────────────────────────────────────────────────

interface LoyaltyTier {
  id: string;
  name: string;
  minSpend: number;
  multiplier: number;
  benefits: string[];
  color: string;
}

interface LeaderboardEntry {
  id: string;
  userId: string;
  points: number;
  tier: string;
  user: { name: string; email: string };
}

// Tier visual config — maps name → design tokens
const TIER_STYLES: Record<string, { band: string; pill: string; pillText: string }> = {
  Bronze: { band: "bg-[--neutral-200]", pill: "bg-[--neutral-100] text-[--neutral-700]", pillText: "text-[--neutral-700]" },
  Silver: { band: "bg-[--gold-100]", pill: "bg-[--gold-100] text-[--gold-700]", pillText: "text-[--gold-700]" },
  Gold: { band: "bg-[--gold-500]", pill: "bg-[--gold-500] text-white", pillText: "text-white" },
};

function getTierStyle(name: string) {
  return (
    TIER_STYLES[name] ?? {
      band: "bg-[--neutral-100]",
      pill: "bg-[--neutral-100] text-[--neutral-700]",
      pillText: "text-[--neutral-700]",
    }
  );
}

// ── Tier Card Component ───────────────────────────────────────────────────────

function TierCard({ tier, onSave }: { tier: LoyaltyTier; onSave: (id: string, data: Partial<LoyaltyTier>) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: tier.name,
    minSpend: String(tier.minSpend),
    multiplier: String(tier.multiplier),
    benefitsRaw: tier.benefits.join("\n"),
  });

  const style = getTierStyle(tier.name);

  function handleSave() {
    onSave(tier.id, {
      name: form.name,
      minSpend: Number(form.minSpend),
      multiplier: Number(form.multiplier),
      benefits: form.benefitsRaw.split("\n").map((b) => b.trim()).filter(Boolean),
    });
    setEditing(false);
  }

  return (
    <div className="bg-white rounded-[14px] border border-[--neutral-200] shadow-[--e1] overflow-hidden">
      {/* Color band */}
      <div className={`h-2 ${style.band}`} />

      <div className="p-5">
        {editing ? (
          /* Edit mode */
          <div className="space-y-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full h-9 px-3 rounded-[8px] border border-[--neutral-200] font-syne text-[16px] font-semibold text-[--neutral-900] focus:outline-none focus:ring-2 focus:ring-[--green-500]"
            />
            <div>
              <label className="block font-dm text-[12px] font-medium text-[--neutral-500] mb-1">Min Spend (KES)</label>
              <input
                type="number"
                value={form.minSpend}
                onChange={(e) => setForm((f) => ({ ...f, minSpend: e.target.value }))}
                className="w-full h-9 px-3 rounded-[8px] border border-[--neutral-200] font-dm text-[14px] text-[--neutral-900] focus:outline-none focus:ring-2 focus:ring-[--green-500]"
              />
            </div>
            <div>
              <label className="block font-dm text-[12px] font-medium text-[--neutral-500] mb-1">Points Multiplier</label>
              <input
                type="number"
                step="0.1"
                min={1}
                value={form.multiplier}
                onChange={(e) => setForm((f) => ({ ...f, multiplier: e.target.value }))}
                className="w-full h-9 px-3 rounded-[8px] border border-[--neutral-200] font-dm text-[14px] text-[--neutral-900] focus:outline-none focus:ring-2 focus:ring-[--green-500]"
              />
            </div>
            <div>
              <label className="block font-dm text-[12px] font-medium text-[--neutral-500] mb-1">Benefits (one per line)</label>
              <textarea
                rows={4}
                value={form.benefitsRaw}
                onChange={(e) => setForm((f) => ({ ...f, benefitsRaw: e.target.value }))}
                className="w-full px-3 py-2 rounded-[8px] border border-[--neutral-200] font-dm text-[13px] text-[--neutral-900] resize-none focus:outline-none focus:ring-2 focus:ring-[--green-500]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[--green-800] text-white font-dm text-[13px] hover:bg-[--green-900] transition-colors"
              >
                <Check size={13} /> Save
              </button>
              <button
                onClick={() => {
                  setForm({ name: tier.name, minSpend: String(tier.minSpend), multiplier: String(tier.multiplier), benefitsRaw: tier.benefits.join("\n") });
                  setEditing(false);
                }}
                className="flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[--neutral-200] text-[--neutral-500] font-dm text-[13px] hover:bg-[--neutral-50] transition-colors"
              >
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Display mode */
          <>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-syne text-[18px] font-semibold text-[--neutral-900]">{tier.name}</h3>
                <p className="font-dm text-[13px] text-[--neutral-500] mt-0.5">
                  Spend KES {tier.minSpend.toLocaleString()}+
                </p>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[--neutral-200] text-[--neutral-500] font-dm text-[13px] hover:bg-[--neutral-100] transition-colors"
              >
                <Pencil size={12} /> Edit
              </button>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[--neutral-100] font-dm text-[13px] font-semibold text-[--neutral-700] mb-4">
              {tier.multiplier}× points
            </div>

            {tier.benefits.length > 0 && (
              <ul className="space-y-1.5 mt-3">
                {tier.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 font-dm text-[13px] text-[--neutral-700]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[--green-500] mt-[5px] shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AdminLoyaltyTiersClient() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-loyalty"],
    queryFn: () => fetch("/api/admin/loyalty/tiers").then((r) => r.json()),
  });

  const tiers: LoyaltyTier[] = data?.data?.tiers ?? [];
  const leaderboard: LeaderboardEntry[] = data?.data?.leaderboard ?? [];

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: updates }: { id: string; data: Partial<LoyaltyTier> }) => {
      const res = await fetch(`/api/admin/loyalty/tiers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to update tier");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Tier updated");
      qc.invalidateQueries({ queryKey: ["admin-loyalty"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Leaderboard columns
  const leaderboardColumns = [
    {
      key: "userId",
      label: "#",
      render: (_: unknown, row: Record<string, unknown>) => {
        const idx = leaderboard.findIndex((e) => e.userId === String(row.userId));
        return (
          <span className={`font-syne text-[14px] font-bold ${idx < 3 ? "text-[--gold-700]" : "text-[--neutral-500]"}`}>
            {idx + 1}
          </span>
        );
      },
    },
    {
      key: "user",
      label: "Customer",
      render: (v: unknown) => {
        const u = v as { name: string; email: string };
        return (
          <div>
            <div className="font-dm text-[14px] font-medium text-[--neutral-900]">{u?.name ?? "—"}</div>
            <div className="font-dm text-[12px] text-[--neutral-400]">{u?.email ?? ""}</div>
          </div>
        );
      },
    },
    {
      key: "points",
      label: "Points",
      sortable: true,
      render: (v: unknown) => (
        <span className="font-dm text-[14px] font-semibold text-[--green-800]">
          {Number(v).toLocaleString()} pts
        </span>
      ),
    },
    {
      key: "tier",
      label: "Tier",
      render: (v: unknown) => {
        const name = String(v);
        const style = getTierStyle(name.charAt(0).toUpperCase() + name.slice(1).toLowerCase());
        return (
          <span className={`inline-block px-2 py-0.5 rounded-full font-dm text-[12px] font-medium ${style.pill}`}>
            {name}
          </span>
        );
      },
    },
  ];

  const totalMembers = leaderboard.length;
  const totalPoints = leaderboard.reduce((sum, e) => sum + e.points, 0);

  return (
    <div className="min-h-screen bg-[--neutral-50]">
      <PageHeader
        title="Loyalty Program"
        description="Manage customer loyalty tiers and rewards"
      />

      <div className="px-6 pb-6 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard eyebrow="Total Members" value={String(totalMembers)} icon={Heart} />
          <StatCard eyebrow="Total Points Issued" value={totalPoints.toLocaleString()} />
          <StatCard eyebrow="Active Tiers" value={String(tiers.length)} />
        </div>

        {/* Tier cards */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-[14px] bg-[--neutral-100] animate-pulse" />
            ))}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-syne text-[20px] font-semibold text-[--neutral-900]">Tiers</h2>
              {/* TODO: Add tier creation — POST /api/admin/loyalty/tiers */}
              <button className="flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[--neutral-200] text-[--neutral-500] font-dm text-[13px] hover:bg-[--neutral-100] transition-colors">
                <Plus size={13} /> Add Tier
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tiers.map((tier) => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  onSave={(id, updates) => updateMutation.mutate({ id, data: updates })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div>
          <h2 className="font-syne text-[20px] font-semibold text-[--neutral-900] mb-4">Points Leaderboard</h2>
          <DataTable
            columns={leaderboardColumns}
            data={leaderboard as unknown as Record<string, unknown>[]}
            loading={isLoading}
            emptyTitle="No loyalty members yet"
            emptyDescription="Customers will appear here once they earn points."
            pageSize={20}
          />
        </div>
      </div>
    </div>
  );
}
