"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Coins, Lock, TrendingUp, ShieldCheck, ShieldX } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatCard } from "@/components/admin/ui/StatCard";
import { DataTable } from "@/components/admin/ui/DataTable";
import { Drawer } from "@/components/admin/ui/Drawer";

// Local, matching AdminCustomersClient's own Avatar — there is no shared one.
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

/**
 * Loyalty programme overview. Entirely read-only — an admin can inspect any
 * balance and its full history but can never alter one. The only write path is
 * the unanimous super-admin grant flow at /admin/loyalty/grants.
 */

type Member = {
  userId: string;
  userCode: string;
  name: string;
  email: string;
  image: string | null;
  points: number;
  lockedPoints: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  level: number;
  badgeCount: number;
  updatedAt: string;
};

type Overview = {
  centsPerPoint: number;
  summary: {
    members: number;
    outstandingPoints: number;
    outstandingLiabilityCents: number;
    lockedPoints: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    ordersPaidWithPoints: number;
    pointsUtilised: number;
    pointsUtilisedValueCents: number;
    openFlags: number;
    pendingGrants: number;
  };
  members: Member[];
};

type LedgerEntry = {
  id: string;
  seq: number;
  delta: number;
  lockedDelta: number;
  balanceAfter: number;
  lockedAfter: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  createdAt: string;
};

type LedgerData = {
  customer: {
    userCode: string;
    name: string;
    email: string;
    points: number;
    lockedPoints: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    level: number;
    badgeCount: number;
    cashValueCents: number;
  };
  integrity: { ok: boolean; entries: number; reason?: string; brokenAtSeq?: number };
  entries: LedgerEntry[];
  badges: { badgeId: string; earnedAt: string; grantedByAdminProfileId: string | null }[];
};

function kes(cents: number) {
  return `KSh ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

const REASON_LABELS: Record<string, string> = {
  SIGNUP_BONUS: "Joining bonus",
  REFERRAL_REWARD: "Referral reward",
  REFERRED_BONUS: "Referred bonus",
  ORDER_BASE: "Order points",
  ORDER_VALUE_TIER: "Order value bonus",
  STREAK_4W: "4-week streak",
  STREAK_6M_WEEKLY: "6-month weekly streak",
  STREAK_6M_MONTHLY: "6-month streak",
  BADGE_AWARD: "Achievement",
  SUPER_ADMIN_GRANT: "Super admin grant",
  REDEEM: "Redeemed at checkout",
  REDEEM_REVERSED: "Redemption reversed",
  ORDER_REFUND_CLAWBACK: "Refund clawback",
  BONUS_VOIDED_ABUSE: "Bonus voided (duplicate account)",
};

export function AdminLoyaltyClient() {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["admin-loyalty"],
    queryFn: async () => {
      const res = await fetch("/api/admin/loyalty");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load loyalty data");
      return json.data;
    },
  });

  const columns = [
    {
      key: "name",
      label: "Customer",
      render: (_: unknown, row: Record<string, unknown>) => {
        const m = row as unknown as Member;
        return (
          <div className="flex items-center gap-3">
            <Avatar name={m.name} size={32} />
            <div>
              <div className="font-dm text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                {m.name}
              </div>
              <div className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted)">
                {m.userCode}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "points",
      label: "Balance",
      render: (_: unknown, row: Record<string, unknown>) => {
        const m = row as unknown as Member;
        return (
          <div className="flex flex-col leading-tight">
            <span className="font-dm text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
              {m.points.toLocaleString()}
            </span>
            {m.lockedPoints > 0 && (
              <span className="font-dm text-[11px] text-(--gold-700)">
                {m.lockedPoints.toLocaleString()} locked
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "level",
      label: "Level",
      render: (_: unknown, row: Record<string, unknown>) => {
        const m = row as unknown as Member;
        return (
          <span className="font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text)">
            Lv {m.level} · {m.badgeCount} badges
          </span>
        );
      },
    },
    {
      key: "lifetimeEarned",
      label: "Earned",
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text)">
          {(row as unknown as Member).lifetimeEarned.toLocaleString()}
        </span>
      ),
    },
    {
      key: "lifetimeRedeemed",
      label: "Spent",
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
          {(row as unknown as Member).lifetimeRedeemed.toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Marketing", href: "/admin/marketing" },
          { label: "Loyalty", href: "/admin/loyalty" },
        ]}
        title="Loyalty & Points"
        description="Read-only. Balances change only through customer activity or an approved super-admin grant."
        goldWash
        action={
          <div className="flex gap-2">
            <Link
              href="/admin/loyalty/grants"
              className="rounded-lg border border-(--neutral-300) px-3 py-2 font-dm text-[13px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Grants
              {data && data.summary.pendingGrants > 0 && (
                <span className="ml-1.5 rounded-full bg-(--gold-700) px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {data.summary.pendingGrants}
                </span>
              )}
            </Link>
            <Link
              href="/admin/loyalty/flags"
              className="rounded-lg border border-(--neutral-300) px-3 py-2 font-dm text-[13px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Flags
              {data && data.summary.openFlags > 0 && (
                <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {data.summary.openFlags}
                </span>
              )}
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          eyebrow="Outstanding points"
          value={data ? data.summary.outstandingPoints.toLocaleString() : "—"}
          trend={
            data
              ? { value: `${kes(data.summary.outstandingLiabilityCents)} liability`, positive: false }
              : undefined
          }
          icon={Coins}
        />
        <StatCard
          eyebrow="Locked (unclaimed)"
          value={data ? data.summary.lockedPoints.toLocaleString() : "—"}
          trend={{ value: "Unlock at first paid order", positive: true }}
          icon={Lock}
        />
        <StatCard
          eyebrow="Points utilised"
          value={data ? data.summary.pointsUtilised.toLocaleString() : "—"}
          trend={
            data
              ? {
                  value: `${kes(data.summary.pointsUtilisedValueCents)} · ${data.summary.ordersPaidWithPoints} orders`,
                  positive: true,
                }
              : undefined
          }
          icon={TrendingUp}
        />
        <StatCard
          eyebrow="Members"
          value={data ? data.summary.members.toLocaleString() : "—"}
          trend={
            data
              ? { value: `${data.summary.lifetimeEarned.toLocaleString()} earned all-time`, positive: true }
              : undefined
          }
          icon={ShieldCheck}
        />
      </div>

      <DataTable
        columns={columns}
        data={(data?.members ?? []) as unknown as Record<string, unknown>[]}
        loading={isLoading}
        onRowClick={(row) => setActiveUserId((row as unknown as Member).userId)}
        emptyTitle="No loyalty members yet"
        emptyDescription="Balances appear here once customers start earning points."
      />

      <LedgerDrawer userId={activeUserId} onClose={() => setActiveUserId(null)} />
    </div>
  );
}

function LedgerDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<LedgerData>({
    queryKey: ["admin-loyalty-ledger", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/loyalty/ledger/${userId}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load ledger");
      return json.data;
    },
  });

  return (
    <Drawer open={!!userId} onClose={onClose} title={data?.customer.name ?? "Points history"} width={640}>
      {isLoading || !data ? (
        <p className="font-dm text-[13px] text-(--neutral-500)">Loading…</p>
      ) : (
        <div className="space-y-5">
          {/* Integrity banner. A failure here means somebody wrote to the table
              directly — the chain is the evidence, so don't "fix" the balance. */}
          {data.integrity.ok ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
              <ShieldCheck size={15} className="text-emerald-700 shrink-0" />
              <span className="font-dm text-[12px] text-emerald-800">
                Ledger verified — {data.integrity.entries} entries, chain intact.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <ShieldX size={15} className="text-red-700 shrink-0 mt-0.5" />
              <span className="font-dm text-[12px] text-red-800">
                <strong>Integrity failure ({data.integrity.reason})</strong>
                {data.integrity.brokenAtSeq ? ` at entry #${data.integrity.brokenAtSeq}` : ""}. This
                ledger was modified outside the application. Investigate before adjusting anything.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Balance", value: data.customer.points.toLocaleString() },
              { label: "Cash value", value: kes(data.customer.cashValueCents) },
              { label: "Locked", value: data.customer.lockedPoints.toLocaleString() },
              { label: "Level", value: `${data.customer.level} · ${data.customer.badgeCount} badges` },
              { label: "Earned all-time", value: data.customer.lifetimeEarned.toLocaleString() },
              { label: "Spent", value: data.customer.lifetimeRedeemed.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-(--neutral-200) p-3">
                <p className="font-dm text-[11px] uppercase tracking-wider text-(--neutral-500)">{label}</p>
                <p className="font-syne text-[16px] font-semibold text-(--neutral-900)">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="font-syne text-[14px] font-semibold text-(--neutral-900) mb-2">
              History ({data.entries.length})
            </h3>
            <ul className="space-y-1">
              {data.entries.map((e) => {
                const net = e.delta + e.lockedDelta;
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-(--neutral-200) px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-dm text-[13px] text-(--neutral-900) truncate">
                        {REASON_LABELS[e.reason] ?? e.reason}
                      </p>
                      <p className="font-dm text-[11px] text-(--neutral-500)">
                        #{e.seq} · {new Date(e.createdAt).toLocaleString()}
                        {e.refType ? ` · ${e.refType}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`font-dm text-[13px] font-semibold ${
                          net > 0 ? "text-emerald-700" : net < 0 ? "text-red-600" : "text-(--neutral-500)"
                        }`}
                      >
                        {net > 0 ? "+" : ""}
                        {net.toLocaleString()}
                        {e.lockedDelta !== 0 && e.delta !== 0 ? " (unlock)" : ""}
                      </p>
                      <p className="font-dm text-[11px] text-(--neutral-500)">
                        bal {e.balanceAfter.toLocaleString()}
                      </p>
                    </div>
                  </li>
                );
              })}
              {data.entries.length === 0 && (
                <li className="font-dm text-[13px] text-(--neutral-500)">No activity yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </Drawer>
  );
}
