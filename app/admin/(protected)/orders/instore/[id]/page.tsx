import { redirect } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { db } from "@/lib/db";
import { loadCallerContext } from "@/lib/require-permission";
import { InStoreFulfillmentPanel } from "@/components/admin/orders/InStoreFulfillmentPanel";
import { ContactCustomerPanel } from "@/components/admin/orders/ContactCustomerPanel";

export const metadata = { title: "In-Store Order Detail | Fechi Organics Admin" };

const PROVIDER_LABELS: Record<string, string> = {
  MPESA_STK: "M-Pesa", MPESA_C2B: "M-Pesa (Till)", PAYSTACK: "Paystack",
};

const CARD = "bg-white border border-(--neutral-200) rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden";
const CARD_HEADER = "px-6 py-4 border-b border-(--neutral-100) bg-(--neutral-50)/50";
const CARD_LABEL = "font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px]";
const CARD_BODY = "p-6";

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—";
  return date.toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminInStoreOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ctx = await loadCallerContext();
  if (ctx.denied) redirect("/admin/login");

  const order = await db.inStoreOrder.findUnique({
    where: { id },
    include: {
      items: true,
      branch: { select: { id: true, name: true, county: true, phone: true } },
      transactions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!order) redirect("/admin/orders");

  if (!ctx.isSuperAdmin && ctx.branchId && ctx.branchId !== order.branchId) {
    redirect("/admin/orders");
  }

  const latestTransaction = order.transactions[0];
  const isFailed = order.paymentStatus === "FAILED";
  const isSuccess = order.paymentStatus === "PAID";
  const showFailureBanner = isFailed && latestTransaction?.status === "FAILED";
  const successTransaction = order.transactions.find((t) => t.status === "SUCCESS") ?? latestTransaction;
  const orderOutcome = isSuccess ? "success" as const : isFailed ? "failed" as const : "neutral" as const;
  const orderRef = order.orderNumber ?? `#FO-${order.id.slice(0, 8).toUpperCase()}`;
  const hasRealEmail = !!order.customerEmail && !order.customerEmail.endsWith("@instore.local");

  return (
    <div className="px-6 py-6 max-w-[1440px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <nav className="flex items-center gap-1.5 font-dm text-[12px] text-(--neutral-500) mb-2">
            <Link href="/admin" className="hover:text-(--green-800) transition-colors">Home</Link>
            <Icon icon="lucide:chevron-right" width={13} />
            <Link href="/admin/orders" className="hover:text-(--green-800) transition-colors">Orders</Link>
            <Icon icon="lucide:chevron-right" width={13} />
            <span className="text-(--neutral-700)">{orderRef}</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="font-syne text-[22px] font-semibold text-(--neutral-900)">Order {orderRef}</h1>
            <span className="font-dm text-[12px] font-medium px-2.5 py-1 rounded-full bg-(--neutral-100) text-(--neutral-700)">
              {order.fulfillmentStatus.replace(/_/g, " ")}
            </span>
            <span className="font-dm text-[11px] font-semibold uppercase tracking-[0.4px] px-2 py-1 rounded-full bg-purple-100 text-purple-800">
              In-Store
            </span>
          </div>
          <p className="font-dm text-[13px] text-(--neutral-400) mt-1">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {order.paymentStatus === "PAID" && (
            <a
              href={`/api/admin/orders/instore/${order.id}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3 rounded-[8px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center gap-1.5 transition-colors"
            >
              <Icon icon="lucide:printer" width={13} /> Print Invoice
            </a>
          )}
          {/* No Copy Link — a walk-in has no customer-facing order page to link to. */}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {showFailureBanner && (
            <div className="flex items-start gap-4 bg-(--danger-bg) border border-(--danger)/20 rounded-xl p-5">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0">
                <Icon icon="lucide:alert-triangle" width={20} className="text-(--danger)" />
              </div>
              <div>
                <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) mb-1">Payment Failed</h2>
                <p className="font-dm text-[14px] text-(--neutral-700)">{latestTransaction?.failureReason ?? "No failure reason on file."}</p>
                <p className="font-dm text-[12px] text-(--neutral-500) mt-1">
                  {PROVIDER_LABELS[latestTransaction?.provider ?? ""] ?? latestTransaction?.provider} — {formatDateTime(latestTransaction?.updatedAt)}
                </p>
              </div>
            </div>
          )}

          {isSuccess && (
            <div className="flex items-start gap-4 bg-(--green-50) border border-(--success)/20 rounded-xl p-5">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0">
                <Icon icon="lucide:check-circle" width={20} className="text-(--success)" />
              </div>
              <div>
                <h2 className="font-syne text-[16px] font-semibold text-(--neutral-900) mb-1">Payment Successful</h2>
                <p className="font-dm text-[14px] text-(--neutral-700)">
                  Transaction confirmed via {PROVIDER_LABELS[successTransaction?.provider ?? ""] ?? successTransaction?.provider ?? "—"}.
                  {successTransaction?.mpesaReceiptNumber ? ` Receipt ${successTransaction.mpesaReceiptNumber}.` : ""}
                </p>
                <p className="font-dm text-[12px] text-(--neutral-500) mt-1">{formatDateTime(successTransaction?.updatedAt)}</p>
              </div>
            </div>
          )}

          {/* Items — in-store items have no product/image relation */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <p className={CARD_LABEL}>Items ({order.items.reduce((s, i) => s + i.quantity, 0)})</p>
            </div>
            <div className={CARD_BODY}>
              <div className="divide-y divide-(--neutral-100)">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="w-12 h-12 rounded-lg bg-(--neutral-100) overflow-hidden shrink-0 flex items-center justify-center">
                      <Icon icon="lucide:tag" width={16} className="text-(--neutral-300)" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-dm text-[13px] font-medium text-(--neutral-900) truncate">{item.name}</p>
                      <p className="font-dm text-[12px] text-(--neutral-400)">{kes(item.priceKes)} × {item.quantity}</p>
                    </div>
                    <p className="font-dm text-[13px] font-semibold text-(--neutral-900) whitespace-nowrap">
                      {kes(item.priceKes * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-(--neutral-100) flex flex-col gap-2">
                <div className="flex justify-between font-dm text-[13px] text-(--neutral-500)">
                  <span>Subtotal</span><span>{kes(order.subtotalKes)}</span>
                </div>
                {order.deliveryKes > 0 && (
                  <div className="flex justify-between font-dm text-[13px] text-(--neutral-500)">
                    <span>Delivery Fee{order.deliveryLocation ? ` — ${order.deliveryLocation}` : ""}</span>
                    <span>{kes(order.deliveryKes)}</span>
                  </div>
                )}
                {order.discountKes > 0 && (
                  <div className="flex justify-between font-dm text-[13px] text-(--success)">
                    <span>Discount</span><span>-{kes(order.discountKes)}</span>
                  </div>
                )}
                <div className="h-px bg-(--neutral-200) my-1" />
                <div className="flex justify-between font-syne text-[16px] font-semibold text-(--neutral-900)">
                  <span>Total</span><span>{kes(order.totalKes)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* POS-style payment details — the till-receipt info that actually
              matters for an in-store sale, in place of the online page's
              OrderStepper (removed — a walk-in sale has no multi-stage
              fulfillment to track). */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <p className={CARD_LABEL}>Payment Details</p>
            </div>
            <div className={`${CARD_BODY} grid grid-cols-2 gap-x-6 gap-y-3 font-dm text-[13px] text-(--neutral-700)`}>
              <p>Provider: {PROVIDER_LABELS[latestTransaction?.provider ?? ""] ?? latestTransaction?.provider ?? "—"}</p>
              <p>Status: {latestTransaction?.status ?? "—"}</p>
              {latestTransaction?.mpesaReceiptNumber && <p>Receipt No: <span className="font-mono">{latestTransaction.mpesaReceiptNumber}</span></p>}
              {latestTransaction?.checkoutRequestId && <p>Checkout Ref: <span className="font-mono">{latestTransaction.checkoutRequestId.slice(0, 20)}</span></p>}
              <p>Amount: {latestTransaction ? kes(latestTransaction.amount) : "—"}</p>
              <p>Processed by: {order.createdByAdminName}</p>
              {order.invoiceNumber && <p>Invoice: {order.invoiceNumber}</p>}
              <p>Receipt sent: {[order.receiptSentEmail && "Email", order.receiptSentSms && "SMS"].filter(Boolean).join(", ") || "Not sent"}</p>
            </div>
          </div>

          {/* Transaction history */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <p className={CARD_LABEL}>Transaction History</p>
            </div>
            {order.transactions.length === 0 ? (
              <p className={`font-dm text-[13px] text-(--neutral-400) ${CARD_BODY}`}>No transactions yet.</p>
            ) : (
              <div className={`${CARD_BODY} divide-y divide-(--neutral-100)`}>
                {order.transactions.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="font-dm text-[13px] font-medium text-(--neutral-900)">
                        {PROVIDER_LABELS[t.provider] ?? t.provider} — {t.status}
                      </p>
                      <p className="font-dm text-[12px] text-(--neutral-400)">{formatDateTime(t.createdAt)}</p>
                      {t.mpesaReceiptNumber && <p className="font-dm text-[12px] text-(--neutral-500)">Receipt: {t.mpesaReceiptNumber}</p>}
                      {t.status === "FAILED" && t.failureReason && (
                        <p className="font-dm text-[12px] text-(--danger) mt-0.5">{t.failureReason}</p>
                      )}
                    </div>
                    <p className="font-dm text-[13px] font-semibold text-(--neutral-900) whitespace-nowrap">{kes(t.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Branch */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <p className={CARD_LABEL}>Branch</p>
            </div>
            <div className={CARD_BODY}>
              <div className="flex items-start gap-2">
                <Icon icon="lucide:map-pin" width={15} className="text-(--neutral-400) shrink-0 mt-0.5" />
                <div className="font-dm text-[13px] text-(--neutral-700)">
                  <p>{order.branch?.name ?? "—"}{order.branch?.county ? `, ${order.branch.county}` : ""}</p>
                  {order.branch?.phone && <p className="text-(--neutral-500) mt-0.5">{order.branch.phone}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Customer card — no account page to link to for a walk-in */}
          <div className={CARD}>
            <div className={CARD_HEADER}>
              <p className={CARD_LABEL}>Customer</p>
            </div>
            <div className={CARD_BODY}>
              <p className="font-dm text-[14px] font-medium text-(--neutral-900)">{order.customerName ?? "Walk-in customer"}</p>
              <div className="flex flex-col gap-1.5 mt-2">
                {hasRealEmail && (
                  <a href={`mailto:${order.customerEmail}`} className="flex items-center gap-2 font-dm text-[13px] text-(--green-800) hover:underline">
                    <Icon icon="lucide:mail" width={13} /> {order.customerEmail}
                  </a>
                )}
                {order.customerPhone && (
                  <a href={`tel:${order.customerPhone}`} className="flex items-center gap-2 font-dm text-[13px] text-(--green-800) hover:underline">
                    <Icon icon="lucide:phone" width={13} /> {order.customerPhone}
                  </a>
                )}
                {!hasRealEmail && !order.customerPhone && (
                  <p className="font-dm text-[13px] text-(--neutral-400)">No contact information on file</p>
                )}
              </div>
            </div>
          </div>

          <ContactCustomerPanel
            orderId={order.id}
            hasPhone={!!order.customerPhone}
            hasEmail={hasRealEmail}
            isGuest={!order.customerUserId}
            orderOutcome={orderOutcome}
            isInStore
          />

          <InStoreFulfillmentPanel
            order={{
              id: order.id,
              orderNumber: order.orderNumber,
              paymentStatus: order.paymentStatus,
              fulfillmentStatus: order.fulfillmentStatus,
              pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
            }}
            isSuperAdmin={ctx.isSuperAdmin}
          />
        </div>
      </div>
    </div>
  );
}
