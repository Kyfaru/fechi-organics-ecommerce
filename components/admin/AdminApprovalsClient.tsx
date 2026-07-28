"use client";

/**
 * AdminApprovalsClient — Approvals queue (admin/super_admin only)
 *
 * Lists PENDING approvalRequest rows created by lib/require-approval.ts
 * whenever a non-admin role attempts a sensitive action. Approve re-runs the
 * original action via lib/approval-executors.ts; reject just records why.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Check, X } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { DataTable } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { toast } from "@/lib/toast";

interface ApprovalRequestRow {
  id: string;
  resource: string;
  action: string;
  resourceId: string | null;
  requestedByName: string;
  requestedByEmail: string;
  createdAt: string;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function AdminApprovalsClient() {
  const qc = useQueryClient();
  const [approveTarget, setApproveTarget] = useState<ApprovalRequestRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequestRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-approvals"],
    queryFn: () => fetch("/api/admin/approvals").then((r) => r.json()).then((j) => j.data?.requests ?? []),
  });

  const requests: ApprovalRequestRow[] = data ?? [];

  const decideMutation = useMutation({
    mutationFn: async ({ id, decision, note }: { id: string; decision: "approve" | "reject"; note?: string }) => {
      const res = await fetch(`/api/admin/approvals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to record decision");
    },
    onSuccess: (_d, { decision }) => {
      toast.success(decision === "approve" ? "Request approved" : "Request rejected");
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
      setApproveTarget(null);
      setRejectTarget(null);
      setRejectNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = [
    {
      key: "requestedByName",
      label: "Requested by",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as ApprovalRequestRow;
        return (
          <div>
            <div className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text)">{r.requestedByName}</div>
            <div className="font-dm text-[11px] text-(--neutral-400)">{r.requestedByEmail}</div>
          </div>
        );
      },
    },
    {
      key: "action",
      label: "Action",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as ApprovalRequestRow;
        return <span className="font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text)">{r.resource}:{r.action}</span>;
      },
    },
    {
      key: "createdAt",
      label: "Requested",
      render: (_: unknown, row: Record<string, unknown>) => (
        <span className="font-mono text-[12px] text-(--neutral-500) whitespace-nowrap">
          {formatTimestamp((row as unknown as ApprovalRequestRow).createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as ApprovalRequestRow;
        return (
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setApproveTarget(r)}
              className="h-8 px-3 flex items-center gap-1.5 rounded-[6px] font-dm text-[13px] bg-(--green-50) hover:bg-(--green-100) text-(--green-800) transition-colors"
            >
              <Check size={13} /> Approve
            </button>
            <button
              onClick={() => setRejectTarget(r)}
              className="h-8 px-3 flex items-center gap-1.5 rounded-[6px] font-dm text-[13px] bg-(--danger-bg) hover:bg-red-100 text-(--danger) transition-colors"
            >
              <X size={13} /> Reject
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader title="Approvals" description="Sensitive actions requested by staff, awaiting admin sign-off" />

      <div className="px-6 pb-6">
        {!isLoading && requests.length === 0 ? (
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1)">
            <EmptyState icon={ClipboardCheck} title="Nothing pending" description="Requests will appear here when a staff member attempts a sensitive action." />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={requests as unknown as Record<string, unknown>[]}
            loading={isLoading}
            pageSize={25}
            emptyTitle="Nothing pending"
            emptyDescription="Requests will appear here when a staff member attempts a sensitive action."
          />
        )}
      </div>

      <ConfirmModal
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={() => approveTarget && decideMutation.mutate({ id: approveTarget.id, decision: "approve" })}
        title="Approve this request?"
        description={approveTarget ? `This will perform "${approveTarget.resource}:${approveTarget.action}" as requested by ${approveTarget.requestedByName}.` : ""}
        confirmLabel="Approve"
        loading={decideMutation.isPending}
      />

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-(--dark-surface) rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-syne text-[18px] font-bold text-(--neutral-900) dark:text-(--dark-text)">Reject request</h3>
            <p className="font-dm text-[13px] text-(--neutral-500)">
              {rejectTarget.resource}:{rejectTarget.action} — requested by {rejectTarget.requestedByName}
            </p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--danger) resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setRejectTarget(null); setRejectNote(""); }}
                className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)"
              >
                Cancel
              </button>
              <button
                onClick={() => decideMutation.mutate({ id: rejectTarget.id, decision: "reject", note: rejectNote || undefined })}
                disabled={decideMutation.isPending}
                className="px-4 py-2 rounded-xl bg-(--danger) text-white font-dm text-[14px] disabled:opacity-50"
              >
                {decideMutation.isPending ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
