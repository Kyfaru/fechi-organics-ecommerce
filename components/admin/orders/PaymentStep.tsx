"use client";

/**
 * PaymentStep — the in-store order wizard's Payment step (NewOrderClient's
 * third step). Resolves which branch the order is being placed from, then
 * offers three payment collection methods as a segmented control: M-Pesa
 * Prompt (STK push), M-Pesa Live (C2B transaction matching), and Card
 * (Paystack). Each method is its own sibling panel component; this component
 * only owns branch resolution + the shared order-context payload the panels
 * submit against.
 *
 * All /api/admin/orders/instore/* routes this step talks to are being built
 * by a parallel backend workstream and may not exist on disk yet — the fetch
 * calls here are written against the agreed JSON contracts and will be
 * reconciled once both land.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Radio, Send, ShieldAlert } from "lucide-react";
import type { Value as PhoneValue } from "react-phone-number-input";
import { PrelineSelect } from "@/components/admin/ui/PrelineSelect";
import MpesaPromptPanel from "@/components/admin/orders/MpesaPromptPanel";
import MpesaLivePanel from "@/components/admin/orders/MpesaLivePanel";
import PaystackPanel from "@/components/admin/orders/PaystackPanel";
import type { OrderCartLine } from "@/components/admin/orders/OrderCartList";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
/** The order-creation payload every payment method builds its request body from. */
export interface PaymentOrderContext {
  customerUserId: string | null;
  customerName: string;
  /** E.164 string form of the Customer step's phone — not editable here (M-Pesa
   *  Prompt keeps its own locally-editable copy seeded from the same source). */
  customerPhone: string;
  customerEmail: string;
  items: Array<{ productId: string; quantity: number }>;
  promoCode: string | undefined;
  branchId: string | undefined;
  totalKes: number;
}

interface AdminMeResponse {
  branchId: string | null;
  branchName: string | null;
  isSuperAdmin: boolean;
  fullName: string;
}

interface BranchOption {
  id: string;
  name: string;
  county: string;
  mpesaType: string;
  shortcode: string;
  phone: string;
  cardEligible: boolean;
}

type PaymentMethod = "mpesa-prompt" | "mpesa-live" | "card";

const METHOD_TABS: Array<{ key: PaymentMethod; label: string; icon: typeof Send }> = [
  { key: "mpesa-prompt", label: "M-Pesa Prompt", icon: Send },
  { key: "mpesa-live", label: "M-Pesa Live", icon: Radio },
  { key: "card", label: "Card", icon: CreditCard },
];

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

interface PaymentStepProps {
  cartItems: OrderCartLine[];
  totalKes: number;
  appliedCoupon: { code: string; discountKes: number } | null;
  customerName: string;
  customerPhone: PhoneValue | undefined;
  customerEmail: string;
  selectedCustomerId: string | null;
}

export default function PaymentStep({
  cartItems,
  totalKes,
  appliedCoupon,
  customerName,
  customerPhone,
  customerEmail,
  selectedCustomerId,
}: PaymentStepProps) {
  const [method, setMethod] = useState<PaymentMethod>("mpesa-prompt");
  const [selectedBranchId, setSelectedBranchId] = useState("");

  // -------------------------------------------------------------------
  // Current admin's branch — GET /api/admin/me returns a plain JSON
  // object (not the { ok, data } envelope other admin routes use), same
  // as the rest of the codebase's usage of this route for the login 2FA
  // flow. isSuperAdmin === false pins the branch to whatever the admin's
  // profile has; isSuperAdmin === true requires an explicit pick below.
  // -------------------------------------------------------------------
  const { data: me, isLoading: meLoading } = useQuery<AdminMeResponse>({
    queryKey: ["admin-me-payment-step"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/me");
        const json = await res.json();
        return {
          branchId: json?.branchId ?? null,
          branchName: json?.branchName ?? null,
          isSuperAdmin: Boolean(json?.isSuperAdmin),
          fullName: json?.fullName ?? "",
        };
      } catch (err) {
        console.error("[PaymentStep] failed to load admin profile", err);
        throw err;
      }
    },
  });

  const isSuperAdmin = me?.isSuperAdmin ?? false;

  // Fetched for every admin, not just super-admins — non-super-admins need
  // it too, to look up their own assigned branch's cardEligible flag below.
  const { data: branchOptions = [], isLoading: branchesLoading } = useQuery<BranchOption[]>({
    queryKey: ["admin-branches-payment-step"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/branches");
        const json = await res.json();
        return (json?.data?.branches ?? []) as BranchOption[];
      } catch (err) {
        console.error("[PaymentStep] failed to load branches", err);
        return [];
      }
    },
  });

  const effectiveBranchId = isSuperAdmin ? (selectedBranchId || undefined) : (me?.branchId ?? undefined);
  const branchReady = isSuperAdmin ? Boolean(selectedBranchId) : Boolean(me?.branchId);
  // Card payment is only offered at branches marked cardEligible (Nairobi/Nakuru at launch).
  const cardEligible = Boolean(branchOptions.find((b) => b.id === effectiveBranchId)?.cardEligible);

  const orderContext: PaymentOrderContext = useMemo(
    () => ({
      customerUserId: selectedCustomerId,
      customerName,
      customerPhone: customerPhone ? (customerPhone as string) : "",
      customerEmail,
      items: cartItems.map((it) => ({ productId: it.productId, quantity: it.quantity })),
      promoCode: appliedCoupon?.code,
      branchId: effectiveBranchId,
      totalKes,
    }),
    [
      selectedCustomerId,
      customerName,
      customerPhone,
      customerEmail,
      cartItems,
      appliedCoupon,
      effectiveBranchId,
      totalKes,
    ]
  );

  return (
    <div className="mt-4 flex flex-col lg:flex-row gap-6 items-start">
      {/* Left column — branch resolution + payment methods */}
      <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
        {/* Branch resolution */}
        <div className="rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) p-4">
          <p className="font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">
            Branch
          </p>
          {meLoading ? (
            <p className="font-dm text-[13px] text-(--neutral-400)">Loading branch…</p>
          ) : isSuperAdmin ? (
            <div className="max-w-xs">
              <PrelineSelect
                options={branchOptions.map((b) => ({ value: b.id, label: `${b.name} — ${b.county}` }))}
                value={selectedBranchId}
                onChange={setSelectedBranchId}
                placeholder={branchesLoading ? "Loading branches…" : "Select a branch…"}
              />
            </div>
          ) : me?.branchId ? (
            <span className="inline-flex items-center h-8 px-3 rounded-full bg-(--green-50) dark:bg-green-900/20 font-dm text-[13px] font-medium text-(--green-800)">
              {me.branchName ?? "Assigned branch"}
            </span>
          ) : (
            <div className="flex items-center gap-2 text-(--danger)">
              <ShieldAlert size={15} />
              <p className="font-dm text-[13px]">
                No branch assigned to your account — payment actions are disabled. Contact a super admin.
              </p>
            </div>
          )}
        </div>

        {/* Method tabs */}
        <div className="rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) overflow-hidden">
          <div className="flex border-b border-(--neutral-100) dark:border-(--dark-border)" role="tablist">
            {METHOD_TABS.filter((tab) => tab.key !== "card" || cardEligible).map((tab) => {
              const TabIcon = tab.icon;
              const active = method === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMethod(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-11 font-dm text-[13px] font-medium transition-colors border-b-2 -mb-px ${
                    active
                      ? "border-(--green-800) text-(--green-800)"
                      : "border-transparent text-(--neutral-500) hover:text-(--neutral-900) dark:hover:text-(--dark-text)"
                  }`}
                >
                  <TabIcon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-4">
            {method === "mpesa-prompt" && (
              <MpesaPromptPanel
                orderContext={orderContext}
                branchReady={branchReady}
                initialPhone={customerPhone}
              />
            )}
            {method === "mpesa-live" && (
              <MpesaLivePanel orderContext={orderContext} branchReady={branchReady} />
            )}
            {method === "card" && cardEligible && (
              <PaystackPanel orderContext={orderContext} branchReady={branchReady} />
            )}
          </div>
        </div>
      </div>

      {/* Right column — running total, kept visible throughout */}
      <div className="w-full lg:w-[320px] shrink-0">
        <div className="rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) p-4 lg:sticky lg:top-6">
          <h3 className="font-syne text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-3">
            Amount Due
          </h3>
          <div className="flex items-center justify-between">
            <span className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
              {cartItems.reduce((sum, it) => sum + it.quantity, 0)} items
            </span>
            <span className="font-syne text-[20px] font-bold text-(--green-800)">{formatKes(totalKes)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
