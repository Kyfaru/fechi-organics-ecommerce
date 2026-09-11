"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { toast } from "@/lib/toast";

/**
 * Accounts the anti-farming score flagged when their joining bonus came due.
 *
 * Reviewing records who looked and when. It does NOT restore a voided bonus —
 * points only move through the ledger, so putting one back is a super-admin
 * grant, on the record, under unanimous approval.
 */

type Reason = { kind: string; sharedWith: number; weight: number };

type Flag = {
  id: string;
  userId: string;
  customer: { id: string; name: string; email: string; createdAt: string } | null;
  score: number;
  reasons: Reason[];
  action: "VOIDED" | "FLAGGED";
  reviewedAt: string | null;
  createdAt: string;
};

const KIND_LABELS: Record<string, string> = {
  PAY_MPESA: "Same M-Pesa number",
  PAY_CARD: "Same payment card",
  PHONE: "Same phone number",
  EMAIL_NORM: "Same email mailbox",
  DEVICE: "Same device",
  IP: "Same network",
};

export function AdminLoyaltyFlagsClient() {
  const qc = useQueryClient();
  const [showReviewed, setShowReviewed] = useState(false);

  const { data, isLoading } = useQuery<{ flags: Flag[] }>({
    queryKey: ["admin-loyalty-flags", showReviewed],
    queryFn: async () => {
      const res = await fetch(`/api/admin/loyalty/flags?reviewed=${showReviewed}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load flags");
      return json.data;
    },
  });

  const review = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/admin/loyalty/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Could not mark as reviewed");
      return json.data;
    },
    onSuccess: () => {
      toast.success("Marked as reviewed");
      qc.invalidateQueries({ queryKey: ["admin-loyalty-flags"] });
      qc.invalidateQueries({ queryKey: ["admin-loyalty"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = [
    {
      key: "customer",
      label: "Customer",
      render: (_: unknown, row: Record<string, unknown>) => {
        const f = row as unknown as Flag;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <p className="font-dm text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                {f.customer?.name ?? f.userId}
              </p>
              <p className="font-dm text-[12px] text-(--neutral-500)">{f.customer?.email ?? "—"}</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 font-dm text-[11px] font-bold uppercase tracking-wide ${
                f.action === "VOIDED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {f.action === "VOIDED" ? "Bonus voided" : "Flagged only"}
            </span>
          </div>
        );
      },
    },
    {
      key: "reasons",
      label: "Matched signals",
      render: (_: unknown, row: Record<string, unknown>) => {
        const f = row as unknown as Flag;
        return (
          <div className="flex flex-wrap gap-1.5">
            {(Array.isArray(f.reasons) ? f.reasons : []).map((r, i) => (
              <span
                key={`${r.kind}-${i}`}
                className="rounded-full bg-(--neutral-100) px-2 py-0.5 font-dm text-[11px] text-(--neutral-700)"
              >
                {KIND_LABELS[r.kind] ?? r.kind} as {r.sharedWith} other{r.sharedWith === 1 ? "" : "s"} (+{r.weight})
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "score",
      label: "Score",
      render: (_: unknown, row: Record<string, unknown>) => {
        const f = row as unknown as Flag;
        return <span className="font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text)">{f.score}</span>;
      },
    },
    {
      key: "createdAt",
      label: "Flagged",
      render: (_: unknown, row: Record<string, unknown>) => {
        const f = row as unknown as Flag;
        return (
          <span className="font-dm text-[12px] text-(--neutral-500)">{new Date(f.createdAt).toLocaleString()}</span>
        );
      },
    },
    {
      key: "review",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const f = row as unknown as Flag;
        if (f.reviewedAt) {
          return (
            <span className="font-dm text-[12px] text-(--neutral-400)">
              Reviewed {new Date(f.reviewedAt).toLocaleDateString()}
            </span>
          );
        }
        return (
          <button
            type="button"
            disabled={review.isPending}
            onClick={(e) => { e.stopPropagation(); review.mutate(f.id); }}
            className="rounded-lg border border-(--neutral-300) px-3 py-1.5 font-dm text-[13px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) disabled:opacity-50"
          >
            Mark reviewed
          </button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Loyalty", href: "/admin/loyalty" },
          { label: "Flags", href: "/admin/loyalty/flags" },
        ]}
        title="Duplicate-account Flags"
        description="Raised when a joining bonus came due on an account sharing signals with another."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowReviewed((v) => !v)}
              className="rounded-lg border border-(--neutral-300) px-3 py-2 font-dm text-[13px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              {showReviewed ? "Show open only" : "Show all"}
            </button>
            <Link
              href="/admin/loyalty"
              className="rounded-lg border border-(--neutral-300) px-3 py-2 font-dm text-[13px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
            >
              Back to loyalty
            </Link>
          </div>
        }
      />

      <div className="px-6 pb-8">
        <DataTable
          columns={columns}
          data={(data?.flags ?? []) as unknown as Record<string, unknown>[]}
          loading={isLoading}
          emptyTitle="Nothing flagged"
          emptyDescription="Signups are clearing the duplicate-account check."
        />
      </div>
    </div>
  );
}
