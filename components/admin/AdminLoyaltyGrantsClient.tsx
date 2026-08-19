"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatCard } from "@/components/admin/ui/StatCard";
import { toast } from "@/lib/toast";

/**
 * Super-admin points grants under unanimous approval.
 *
 * Every currently-active super admin must approve before points are released;
 * one rejection kills the request. The points come out of the requester's
 * personal lifetime allowance, which nothing in this UI can top back up.
 */

type Approval = {
  adminProfileId: string;
  fullName: string | null;
  decision: "PENDING" | "APPROVED" | "REJECTED";
  decidedAt: string;
};

type Request = {
  id: string;
  points: number;
  note: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  decidedAt: string | null;
  requestedBy: { id: string; fullName: string };
  target: { id: string; name: string | null; email: string | null };
  approvals: Approval[];
  outstanding: string[];
  iHaveVoted: boolean;
};

type GrantsData = {
  requiredApprovals: number;
  voters: { id: string; fullName: string; remaining: number }[];
  myAdminProfileId: string;
  requests: Request[];
};

export function AdminLoyaltyGrantsClient() {
  const qc = useQueryClient();
  const [targetUserId, setTargetUserId] = useState("");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery<GrantsData>({
    queryKey: ["admin-loyalty-grants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/loyalty/grants");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to load grants");
      return json.data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/loyalty/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: targetUserId.trim(),
          points: parseInt(points, 10),
          note: note.trim(),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Could not raise the grant");
      return json.data;
    },
    onSuccess: (d: { status: string }) => {
      toast.success(
        d.status === "APPROVED"
          ? "Grant released — you were the only approval needed"
          : "Grant raised. Every other super admin must approve it.",
      );
      setTargetUserId("");
      setPoints("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin-loyalty-grants"] });
      qc.invalidateQueries({ queryKey: ["admin-loyalty"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vote = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "APPROVED" | "REJECTED" }) => {
      const res = await fetch(`/api/admin/loyalty/grants/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Could not record your vote");
      return json.data;
    },
    onSuccess: (d: { status: string }) => {
      toast.success(
        d.status === "APPROVED"
          ? "Unanimous — points released"
          : d.status === "REJECTED"
            ? "Grant rejected"
            : "Vote recorded. Still waiting on others.",
      );
      qc.invalidateQueries({ queryKey: ["admin-loyalty-grants"] });
      qc.invalidateQueries({ queryKey: ["admin-loyalty"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const me = data?.voters.find((v) => v.id === data.myAdminProfileId);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Loyalty", href: "/admin/loyalty" },
          { label: "Grants", href: "/admin/loyalty/grants" },
        ]}
        title="Points Grants"
        description="Every active super admin must approve before points are released. One rejection ends it."
        action={
          <Link
            href="/admin/loyalty"
            className="rounded-lg border border-(--neutral-300) px-3 py-2 font-dm text-[13px] font-medium text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
          >
            Back to loyalty
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <StatCard
          eyebrow="Approvals required"
          value={data ? String(data.requiredApprovals) : "—"}
          trend={{ value: "Every active super admin", positive: true }}
          icon={Users}
        />
        <StatCard
          eyebrow="Your remaining allowance"
          value={me ? me.remaining.toLocaleString() : "—"}
          trend={{ value: "Not renewable", positive: false }}
          icon={Wallet}
        />
        <StatCard
          eyebrow="Pending requests"
          value={data ? String(data.requests.filter((r) => r.status === "PENDING").length) : "—"}
          icon={ShieldCheck}
        />
      </div>

      {/* Raise a grant */}
      <div className="rounded-xl border border-(--neutral-200) bg-white p-5 mb-6 dark:bg-(--dark-surface) dark:border-(--dark-border)">
        <h2 className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">
          Raise a grant
        </h2>
        <p className="font-dm text-[13px] text-(--neutral-500) mb-4">
          Points come out of your own lifetime allowance. It cannot be topped up from here.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px]">
          <input
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            placeholder="Customer user ID"
            className="h-10 rounded-lg border border-(--neutral-300) px-3 font-dm text-[14px] outline-none focus:border-(--green-800)"
          />
          <input
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="Points"
            className="h-10 rounded-lg border border-(--neutral-300) px-3 font-dm text-[14px] outline-none focus:border-(--green-800)"
          />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for this grant (required, permanently recorded)"
          rows={2}
          className="mt-3 w-full rounded-lg border border-(--neutral-300) px-3 py-2 font-dm text-[14px] outline-none focus:border-(--green-800)"
        />
        <button
          type="button"
          disabled={create.isPending || !targetUserId.trim() || !points || !note.trim()}
          onClick={() => create.mutate()}
          className="mt-3 rounded-lg bg-(--green-800) px-4 py-2 font-dm text-[14px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? "Raising…" : "Raise grant"}
        </button>
      </div>

      {/* Requests */}
      {isLoading ? (
        <p className="font-dm text-[13px] text-(--neutral-500)">Loading…</p>
      ) : !data || data.requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-(--neutral-200) p-8 text-center font-dm text-[13px] text-(--neutral-400)">
          No grant requests yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.requests.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-(--neutral-200) bg-white p-4 dark:bg-(--dark-surface) dark:border-(--dark-border)"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="font-syne text-[15px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                    {r.points.toLocaleString()} points → {r.target.name ?? r.target.id}
                  </p>
                  <p className="font-dm text-[12px] text-(--neutral-500)">
                    {r.target.email ?? "—"} · requested by {r.requestedBy.fullName} ·{" "}
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-1.5 font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text)">
                    {r.note}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 font-dm text-[11px] font-bold uppercase tracking-wide ${
                    r.status === "APPROVED"
                      ? "bg-emerald-50 text-emerald-700"
                      : r.status === "REJECTED"
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {r.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.approvals.map((a) => (
                  <span
                    key={a.adminProfileId}
                    className={`rounded-full px-2 py-0.5 font-dm text-[11px] ${
                      a.decision === "APPROVED"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {a.fullName ?? a.adminProfileId} · {a.decision === "APPROVED" ? "approved" : "rejected"}
                  </span>
                ))}
                {r.status === "PENDING" &&
                  r.outstanding.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-(--neutral-100) px-2 py-0.5 font-dm text-[11px] text-(--neutral-500)"
                    >
                      {name} · waiting
                    </span>
                  ))}
              </div>

              {r.status === "PENDING" && !r.iHaveVoted && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={vote.isPending}
                    onClick={() => vote.mutate({ id: r.id, decision: "APPROVED" })}
                    className="rounded-lg bg-(--green-800) px-3 py-1.5 font-dm text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={vote.isPending}
                    onClick={() => vote.mutate({ id: r.id, decision: "REJECTED" })}
                    className="rounded-lg border border-red-300 px-3 py-1.5 font-dm text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
