"use client";

/**
 * AdminBranchesClient — Branches page
 *
 * Two sections:
 *  - Zoho organizations (HQ/global-scope only): the small number of shared
 *    Zoho Inventory orgs and their credentials. Several branches can point
 *    at the same org.
 *  - Branches: lists branches and lets an authorized admin link a branch to
 *    one of those organizations (+ optionally its Zoho warehouse id for
 *    per-branch stock splitting). Admin/super_admin can edit any branch; a
 *    branch-scoped manager only their own (enforced server-side regardless —
 *    this client-side hide is UX only, matching the pattern everywhere else
 *    in the admin panel).
 *
 * Editing is gated behind a password re-entry step, identical in shape to
 * AdminStaffClient.tsx's "Change Role" modal.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, XCircle, Copy, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { useAdminMe } from "@/hooks/use-can";
import { toast } from "@/lib/toast";

interface Branch {
  id: string;
  name: string;
  county: string;
  isActive: boolean;
  zohoConnected: boolean;
  zohoOrganizationId: string | null;
  zohoOrganizationName: string | null;
  zohoWarehouseId: string | null;
}

interface ZohoOrganization {
  id: string;
  name: string;
  zohoOrgId: string;
  connectedAt: string | null;
  branches: { id: string; name: string }[];
}

export function AdminBranchesClient() {
  const qc = useQueryClient();
  const { data: me } = useAdminMe();
  const isGlobalScope = Boolean(me?.isSuperAdmin || !me?.branchId);

  const { data: branchData, isLoading: branchesLoading } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: () => fetch("/api/admin/branches").then((r) => r.json()).then((j) => j.data?.branches ?? []),
  });
  const branches: Branch[] = branchData ?? [];

  const { data: orgData, isLoading: orgsLoading } = useQuery({
    queryKey: ["admin-zoho-organizations"],
    queryFn: () => fetch("/api/admin/zoho/organizations").then((r) => r.json()).then((j) => j.data?.organizations ?? []),
    enabled: isGlobalScope,
  });
  const organizations: ZohoOrganization[] = orgData ?? [];

  async function verifyAdminPassword(password: string): Promise<boolean> {
    const res = await fetch("/api/admin/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    return json.ok === true;
  }

  // ---------------------------------------------------------------------
  // Branch → organization link modal
  // ---------------------------------------------------------------------
  const [linkTarget, setLinkTarget] = useState<Branch | null>(null);
  const [linkPw, setLinkPw] = useState("");
  const [linkVerified, setLinkVerified] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkForm, setLinkForm] = useState({ zohoOrganizationId: "", zohoWarehouseId: "" });

  function canEdit(branch: Branch): boolean {
    if (!me?.role) return false;
    if (me.isSuperAdmin) return true;
    return me.branchId === branch.id;
  }

  function openLinkModal(branch: Branch) {
    setLinkTarget(branch);
    setLinkPw("");
    setLinkVerified(false);
    setLinkForm({ zohoOrganizationId: branch.zohoOrganizationId ?? "", zohoWarehouseId: branch.zohoWarehouseId ?? "" });
  }

  function closeLinkModal() {
    setLinkTarget(null);
    setLinkPw("");
    setLinkVerified(false);
    setLinkLoading(false);
  }

  async function handleVerifyForLink() {
    setLinkLoading(true);
    try {
      const ok = await verifyAdminPassword(linkPw);
      if (!ok) { toast.error("Incorrect password"); return; }
      setLinkVerified(true);
    } finally { setLinkLoading(false); }
  }

  async function handleSaveLink() {
    if (!linkTarget) return;
    setLinkLoading(true);
    try {
      const res = await fetch(`/api/admin/branches/${linkTarget.id}/zoho`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zohoOrganizationId: linkForm.zohoOrganizationId,
          zohoWarehouseId: linkForm.zohoWarehouseId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Failed to save");

      toast.success("Branch updated", { message: `${linkTarget.name}'s Zoho link was saved.` });
      qc.invalidateQueries({ queryKey: ["admin-branches"] });
      closeLinkModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLinkLoading(false);
    }
  }

  // ---------------------------------------------------------------------
  // Zoho organization credentials modal (create or edit)
  // ---------------------------------------------------------------------
  const [orgTarget, setOrgTarget] = useState<ZohoOrganization | "new" | null>(null);
  const [orgPw, setOrgPw] = useState("");
  const [orgVerified, setOrgVerified] = useState(false);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgForm, setOrgForm] = useState({ name: "", zohoOrgId: "", clientId: "", clientSecret: "", refreshToken: "" });

  const [webhookReveal, setWebhookReveal] = useState<{ secret: string; url: string } | null>(null);

  function openOrgModal(target: ZohoOrganization | "new") {
    setOrgTarget(target);
    setOrgPw("");
    setOrgVerified(false);
    setOrgForm(
      target === "new"
        ? { name: "", zohoOrgId: "", clientId: "", clientSecret: "", refreshToken: "" }
        : { name: target.name, zohoOrgId: target.zohoOrgId, clientId: "", clientSecret: "", refreshToken: "" },
    );
  }

  function closeOrgModal() {
    setOrgTarget(null);
    setOrgPw("");
    setOrgVerified(false);
    setOrgLoading(false);
  }

  async function handleVerifyForOrg() {
    setOrgLoading(true);
    try {
      const ok = await verifyAdminPassword(orgPw);
      if (!ok) { toast.error("Incorrect password"); return; }
      setOrgVerified(true);
    } finally { setOrgLoading(false); }
  }

  async function handleSaveOrg() {
    if (!orgTarget) return;
    setOrgLoading(true);
    try {
      const isNew = orgTarget === "new";
      const url = isNew ? "/api/admin/zoho/organizations" : `/api/admin/zoho/organizations/${orgTarget.id}`;
      const method = isNew ? "POST" : "PATCH";

      const body: Record<string, string> = {};
      if (orgForm.name.trim()) body.name = orgForm.name.trim();
      if (orgForm.zohoOrgId.trim()) body.zohoOrgId = orgForm.zohoOrgId.trim();
      if (orgForm.clientId.trim()) body.clientId = orgForm.clientId.trim();
      if (orgForm.clientSecret.trim()) body.clientSecret = orgForm.clientSecret.trim();
      if (orgForm.refreshToken.trim()) body.refreshToken = orgForm.refreshToken.trim();

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Failed to save");

      toast.success(isNew ? "Zoho organization created" : "Zoho organization updated");
      qc.invalidateQueries({ queryKey: ["admin-zoho-organizations"] });
      closeOrgModal();

      if (json.data?.webhookSecret) {
        setWebhookReveal({ secret: json.data.webhookSecret, url: json.data.webhookUrl });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setOrgLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      <PageHeader
        title="Branches"
        description="Manage store locations and their Zoho Inventory connections"
      />

      {isGlobalScope && (
        <div className="px-6 pb-6">
          <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-(--neutral-200) dark:border-(--dark-border)">
              <div>
                <h2 className="font-syne text-[16px] font-bold text-(--neutral-900) dark:text-(--dark-text)">Zoho Organizations</h2>
                <p className="font-dm text-[12px] text-(--neutral-500)">Shared credentials — several branches can link to the same organization.</p>
              </div>
              <button
                onClick={() => openOrgModal("new")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[13px] font-medium"
              >
                <Plus size={14} /> New organization
              </button>
            </div>
            {orgsLoading ? (
              <div className="p-8 text-center font-dm text-[14px] text-(--neutral-400)">Loading…</div>
            ) : organizations.length === 0 ? (
              <div className="p-8 text-center font-dm text-[14px] text-(--neutral-400)">No Zoho organizations yet.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg)">
                    <th className="px-6 py-3 text-left font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500)">Organization</th>
                    <th className="px-6 py-3 text-left font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500)">Zoho Org ID</th>
                    <th className="px-6 py-3 text-left font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500)">Linked Branches</th>
                    <th className="px-6 py-3 text-right font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500)">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org, idx) => (
                    <tr key={org.id} className={`border-b border-(--neutral-200) dark:border-(--dark-border) ${idx % 2 === 0 ? "" : "bg-(--neutral-50)/50 dark:bg-(--dark-bg)/30"}`}>
                      <td className="px-6 py-4 font-dm text-[14px] font-medium text-(--neutral-900) dark:text-(--dark-text)">{org.name}</td>
                      <td className="px-6 py-4 font-dm text-[13px] text-(--neutral-600)">{org.zohoOrgId}</td>
                      <td className="px-6 py-4 font-dm text-[13px] text-(--neutral-600)">
                        {org.branches.length > 0 ? org.branches.map((b) => b.name).join(", ") : "None linked"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => openOrgModal(org)} className="font-dm text-[13px] font-medium text-(--green-800) hover:underline">
                          Edit credentials
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="px-6 pb-6">
        <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) overflow-hidden">
          {branchesLoading ? (
            <div className="p-8 text-center font-dm text-[14px] text-(--neutral-400)">Loading…</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg)">
                  <th className="px-6 py-3 text-left font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500)">Branch</th>
                  <th className="px-6 py-3 text-left font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500)">County</th>
                  <th className="px-6 py-3 text-left font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500)">Zoho Organization</th>
                  <th className="px-6 py-3 text-right font-dm text-[12px] font-medium uppercase tracking-wider text-(--neutral-500)">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch, idx) => (
                  <tr
                    key={branch.id}
                    className={`border-b border-(--neutral-200) dark:border-(--dark-border) ${idx % 2 === 0 ? "" : "bg-(--neutral-50)/50 dark:bg-(--dark-bg)/30"}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-dm text-[14px] font-medium text-(--neutral-900) dark:text-(--dark-text)">
                        <Building2 size={15} className="text-(--neutral-400)" />
                        {branch.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-dm text-[13px] text-(--neutral-600)">{branch.county}</td>
                    <td className="px-6 py-4">
                      {branch.zohoConnected ? (
                        <span className="inline-flex items-center gap-1.5 font-dm text-[13px] text-(--success)">
                          <CheckCircle2 size={14} /> {branch.zohoOrganizationName ?? "Connected"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-dm text-[13px] text-(--neutral-400)">
                          <XCircle size={14} /> Not linked
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canEdit(branch) && (
                        <button
                          onClick={() => openLinkModal(branch)}
                          className="font-dm text-[13px] font-medium text-(--green-800) hover:underline"
                        >
                          Edit Zoho Link
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Branch → organization link modal */}
      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-(--dark-surface) rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-syne text-[18px] font-bold text-(--neutral-900) dark:text-(--dark-text)">
              Zoho link — {linkTarget.name}
            </h3>

            {!linkVerified ? (
              <>
                <p className="font-dm text-[13px] text-(--neutral-500)">Enter your own admin password to continue.</p>
                <input
                  type="password"
                  value={linkPw}
                  onChange={(e) => setLinkPw(e.target.value)}
                  placeholder="Your password"
                  className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={closeLinkModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleVerifyForLink} disabled={linkLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Verify</button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Zoho Organization</label>
                    <select
                      value={linkForm.zohoOrganizationId}
                      onChange={(e) => setLinkForm((p) => ({ ...p, zohoOrganizationId: e.target.value }))}
                      className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500) bg-white"
                    >
                      <option value="">Not linked</option>
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Zoho Warehouse ID (optional)</label>
                    <input
                      value={linkForm.zohoWarehouseId}
                      onChange={(e) => setLinkForm((p) => ({ ...p, zohoWarehouseId: e.target.value }))}
                      placeholder="Zoho Inventory → Settings → Warehouses"
                      className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                    />
                    <p className="font-dm text-[11px] text-(--neutral-400) mt-1">
                      Splits this branch&apos;s stock from the org&apos;s per-warehouse breakdown. Leave blank to use the org&apos;s combined stock number for this branch.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={closeLinkModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleSaveLink} disabled={linkLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Save</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Zoho organization credentials modal */}
      {orgTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-(--dark-surface) rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-syne text-[18px] font-bold text-(--neutral-900) dark:text-(--dark-text)">
              {orgTarget === "new" ? "New Zoho organization" : `Zoho credentials — ${orgTarget.name}`}
            </h3>

            {!orgVerified ? (
              <>
                <p className="font-dm text-[13px] text-(--neutral-500)">Enter your own admin password to continue.</p>
                <input
                  type="password"
                  value={orgPw}
                  onChange={(e) => setOrgPw(e.target.value)}
                  placeholder="Your password"
                  className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={closeOrgModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleVerifyForOrg} disabled={orgLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Verify</button>
                </div>
              </>
            ) : (
              <>
                <p className="font-dm text-[12px] text-(--neutral-400)">
                  Leave a field blank to keep its existing value — secrets are never shown again once saved.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Name</label>
                    <input
                      value={orgForm.name}
                      onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Org A — Nairobi/Nakuru (KCB Buni)"
                      className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                    />
                  </div>
                  <div>
                    <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Zoho Org ID</label>
                    <input
                      value={orgForm.zohoOrgId}
                      onChange={(e) => setOrgForm((p) => ({ ...p, zohoOrgId: e.target.value }))}
                      placeholder="e.g. 60012345678"
                      className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                    />
                  </div>
                  <div>
                    <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Client ID</label>
                    <input
                      value={orgForm.clientId}
                      onChange={(e) => setOrgForm((p) => ({ ...p, clientId: e.target.value }))}
                      placeholder="•••• (leave blank to keep existing)"
                      className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                    />
                  </div>
                  <div>
                    <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Client Secret</label>
                    <input
                      type="password"
                      value={orgForm.clientSecret}
                      onChange={(e) => setOrgForm((p) => ({ ...p, clientSecret: e.target.value }))}
                      placeholder="•••• (leave blank to keep existing)"
                      className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                    />
                  </div>
                  <div>
                    <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Refresh Token</label>
                    <input
                      type="password"
                      value={orgForm.refreshToken}
                      onChange={(e) => setOrgForm((p) => ({ ...p, refreshToken: e.target.value }))}
                      placeholder="•••• (leave blank to keep existing)"
                      className="w-full h-10 px-3 rounded-xl border border-(--neutral-200) font-dm text-[14px] outline-none focus:border-(--green-500)"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={closeOrgModal} className="px-4 py-2 rounded-xl font-dm text-[14px] text-(--neutral-600) hover:bg-(--neutral-100)">Cancel</button>
                  <button onClick={handleSaveOrg} disabled={orgLoading} className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px] disabled:opacity-60">Save</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* One-time webhook secret reveal */}
      {webhookReveal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-(--dark-surface) rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h3 className="font-syne text-[18px] font-bold text-(--neutral-900) dark:text-(--dark-text)">
              Webhook secret — copy it now
            </h3>
            <p className="font-dm text-[13px] text-(--neutral-500)">
              This secret is shown only once. Paste it, along with the webhook URL, into this organization&apos;s Zoho
              webhook configuration.
            </p>
            <div>
              <label className="font-dm text-[12px] font-medium text-(--neutral-500) block mb-1">Webhook URL</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-(--neutral-50) dark:bg-(--dark-bg) font-dm text-[12px] break-all">{webhookReveal.url}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(webhookReveal.url); toast.success("Copied"); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-(--neutral-100)"
                  aria-label="Copy webhook URL"
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
            <div>
              <label className="font-dm text-[12px] font-medium text-(--neutral-500) block mb-1">Webhook Secret</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-(--neutral-50) dark:bg-(--dark-bg) font-dm text-[12px] break-all">{webhookReveal.secret}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(webhookReveal.secret); toast.success("Copied"); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-(--neutral-100)"
                  aria-label="Copy webhook secret"
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setWebhookReveal(null)}
                className="px-4 py-2 rounded-xl bg-(--green-800) text-white font-dm text-[14px]"
              >
                Done — I&apos;ve saved it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
