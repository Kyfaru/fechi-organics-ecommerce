import { redirect } from "next/navigation";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { db } from "@/lib/db";
import { loadCallerContext } from "@/lib/require-permission";
import { combineLegacyPhone } from "@/lib/phone";
import { r2PublicUrl } from "@/lib/r2";
import OrderStepper from "@/components/account/orders/OrderStepper";
import { CopyLinkButton } from "@/components/admin/orders/CopyLinkButton";
import { FulfillmentPanel } from "@/components/admin/orders/FulfillmentPanel";
import { ContactCustomerPanel } from "@/components/admin/orders/ContactCustomerPanel";

export const metadata = { title: "Order Detail | Fechi Organics Admin" };

const PROVIDER_LABELS: Record<string, string> = {
  MPESA: "M-Pesa", PAYSTACK: "Paystack", KCB: "KCB Buni",
};

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—";
  return date.toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Layout's AdminGuard already enforces orders:["view"] for any /admin/orders/*
  // path — this is only the branch-scoping check it doesn't do (mirrors
  // app/admin/(protected)/orders/payment-failed/[token]/page.tsx).
  const ctx = await loadCallerContext();
  if (ctx.denied) redirect("/admin/login");

  const order = await db.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      items: {
        include: {
          product: {
            select: { name: true, images: { where: { isPrimary: true }, take: 1, select: { objectKey: true } } },
          },
        },
      },
      branch: { select: { id: true, name: true, county: true, phone: true } },
      transactions: { orderBy: { createdAt: "desc" } },
      statusEvents: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (!order) redirect("/admin/orders");

  if (!ctx.isSuperAdmin && ctx.branchId && ctx.branchId !== order.branchId) {
    redirect("/admin/orders");
  }

  const latestTransaction = order.transactions[0];
  const showFailureBanner = order.status === "FAILED" && latestTransaction?.status === "FAILED";
  const orderRef = order.orderNumber ?? `#FO-${order.id.slice(0, 8).toUpperCase()}`;
  const customerPhone = order.user?.phone
    ? combineLegacyPhone(order.user.phone, null)
    : order.deliveryPhone;
  const customerEmail = order.user?.email ?? order.guestEmail;

  return (
    <div className="px-6 py-6 max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <Link href="/admin/orders" className="inline-flex items-center gap-1.5 font-dm text-[13px] text-(--neutral-500) hover:text-(--green-800) transition-colors mb-2">
            <Icon icon="lucide:arrow-left" width={13} /> Back to Orders
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-syne text-[22px] font-semibold text-(--neutral-900)">Order {orderRef}</h1>
            <span className="font-dm text-[12px] font-medium px-2.5 py-1 rounded-full bg-(--neutral-100) text-(--neutral-700)">
              {order.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="font-dm text-[13px] text-(--neutral-400) mt-1">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {order.status !== "FAILED" && order.status !== "CANCELLED" && order.paymentStatus === "PAID" && (
            <a
              href={`/api/admin/orders/${order.id}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3 rounded-[8px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center gap-1.5 transition-colors"
            >
              <Icon icon="lucide:printer" width={13} /> Print Invoice
            </a>
          )}
          <CopyLinkButton path={`/account/orders/${encodeURIComponent(order.orderNumber ?? order.id)}`} />
        </div>
      </div>

      {/* Failure banner */}
      {showFailureBanner && (
        <div className="flex items-start gap-4 bg-(--danger-bg) border border-(--danger)/20 rounded-[12px] p-5 mb-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Items */}
          <div className="bg-white border border-(--neutral-200) rounded-[10px] overflow-hidden">
            <div className="px-4 py-3 border-b border-(--neutral-100)">
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px]">
                Items ({order.items.reduce((s, i) => s + i.quantity, 0)})
              </p>
            </div>
            <div className="divide-y divide-(--neutral-100)">
              {order.items.map((item) => {
                const imgKey = item.product.images[0]?.objectKey;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-[6px] bg-(--neutral-100) overflow-hidden shrink-0 flex items-center justify-center">
                      {imgKey ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r2PublicUrl(imgKey)} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Icon icon="lucide:tag" width={14} className="text-(--neutral-300)" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-dm text-[13px] font-medium text-(--neutral-900) truncate">{item.name}</p>
                      {item.variantLabel && <p className="font-dm text-[12px] text-(--neutral-500)">{item.variantLabel}</p>}
                      <p className="font-dm text-[12px] text-(--neutral-400)">{kes(item.priceKes)} × {item.quantity}</p>
                    </div>
                    <p className="font-dm text-[13px] font-semibold text-(--neutral-900) whitespace-nowrap">
                      {kes(item.priceKes * item.quantity)}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* Money breakdown */}
            <div className="bg-(--neutral-50) p-4 flex flex-col gap-2 border-t border-(--neutral-100)">
              <div className="flex justify-between font-dm text-[13px] text-(--neutral-500)">
                <span>Subtotal</span><span>{kes(order.subtotalKes)}</span>
              </div>
              <div className="flex justify-between font-dm text-[13px] text-(--neutral-500)">
                <span>Delivery / Transport Fee</span><span>{kes(order.deliveryKes)}</span>
              </div>
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

          {/* Order progress */}
          <div className="bg-white border border-(--neutral-200) rounded-[10px] p-4">
            <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-4">Order Progress</p>
            <OrderStepper
              currentStatus={order.status}
              deliveryType={order.deliveryType}
              statusEvents={order.statusEvents.map((e) => ({
                status: e.status,
                occurredAt: e.occurredAt.toISOString(),
                note: e.note,
              }))}
            />
          </div>

          {/* Delivery / pickup */}
          <div className="bg-white border border-(--neutral-200) rounded-[10px] p-4">
            <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-3">
              {order.deliveryType === "PICKUP" ? "Store Pickup" : "Shipping Address"}
            </p>
            {order.deliveryType === "PICKUP" ? (
              <div className="flex items-start gap-2">
                <Icon icon="lucide:map-pin" width={15} className="text-(--neutral-400) shrink-0 mt-0.5" />
                <div className="font-dm text-[13px] text-(--neutral-700)">
                  <p>Customer will collect from store{order.branch?.name ? ` — ${order.branch.name}` : ""}</p>
                  {order.branch?.phone && <p className="text-(--neutral-500) mt-0.5">{order.branch.phone}</p>}
                  {order.pickupCode && <p className="text-(--neutral-500) mt-0.5">Pickup code: <span className="font-mono">{order.pickupCode}</span> {order.pickupCodeExpiresAt && `(expires ${formatDateTime(order.pickupCodeExpiresAt)})`}</p>}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <Icon icon="lucide:map-pin" width={15} className="text-(--neutral-400) shrink-0 mt-0.5" />
                <div className="font-dm text-[13px] text-(--neutral-700)">
                  {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
                  {order.deliveryCity && <p>{order.deliveryCity}{order.deliveryCounty ? `, ${order.deliveryCounty}` : ""}</p>}
                  {order.deliveryPhone && <p className="text-(--neutral-500) mt-0.5">{order.deliveryPhone}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Transaction history */}
          <div className="bg-white border border-(--neutral-200) rounded-[10px] overflow-hidden">
            <div className="px-4 py-3 border-b border-(--neutral-100)">
              <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px]">Transaction History</p>
            </div>
            {order.transactions.length === 0 ? (
              <p className="font-dm text-[13px] text-(--neutral-400) px-4 py-4">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-(--neutral-100)">
                {order.transactions.map((t) => (
                  <div key={t.id} className="px-4 py-3 flex items-start justify-between gap-3">
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

          {/* Admin metadata */}
          <div className="bg-white border border-(--neutral-200) rounded-[10px] p-4">
            <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-3">Admin Metadata</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-dm text-[13px] text-(--neutral-700)">
              {order.processedAt && <p>Processed: {formatDateTime(order.processedAt)}</p>}
              {order.confirmedAt && <p>Confirmed: {formatDateTime(order.confirmedAt)}</p>}
              {order.shippedAt && <p>Shipped: {formatDateTime(order.shippedAt)}</p>}
              {order.invoiceNumber && <p>Invoice: {order.invoiceNumber}</p>}
              {(order.utmSource || order.utmMedium || order.utmCampaign) && (
                <p>UTM: {[order.utmSource, order.utmMedium, order.utmCampaign].filter(Boolean).join(" / ")}</p>
              )}
              <p>Created: {formatDateTime(order.createdAt)}</p>
              <p>Updated: {formatDateTime(order.updatedAt)}</p>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Customer card */}
          <div className="bg-white border border-(--neutral-200) rounded-[10px] p-4">
            <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Customer</p>
            <p className="font-dm text-[14px] font-medium text-(--neutral-900)">{order.user?.name ?? "Guest"}</p>
            <div className="flex flex-col gap-1.5 mt-2">
              {customerEmail && (
                <a href={`mailto:${customerEmail}`} className="flex items-center gap-2 font-dm text-[13px] text-(--green-800) hover:underline">
                  <Icon icon="lucide:mail" width={13} /> {customerEmail}
                </a>
              )}
              {customerPhone && (
                <a href={`tel:${customerPhone}`} className="flex items-center gap-2 font-dm text-[13px] text-(--green-800) hover:underline">
                  <Icon icon="lucide:phone" width={13} /> {customerPhone}
                </a>
              )}
              {!customerEmail && !customerPhone && (
                <p className="font-dm text-[13px] text-(--neutral-400)">No contact information on file</p>
              )}
            </div>
          </div>

          <ContactCustomerPanel
            orderId={order.id}
            hasPhone={!!customerPhone}
            hasEmail={!!customerEmail}
            isGuest={!order.userId}
          />

          <FulfillmentPanel
            order={{
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              deliveryType: order.deliveryType,
              processingBy: order.processingBy,
              processedAt: order.processedAt?.toISOString() ?? null,
              staffPickupConfirmedAt: order.staffPickupConfirmedAt?.toISOString() ?? null,
            }}
            isSuperAdmin={ctx.isSuperAdmin}
          />
        </div>
      </div>
    </div>
  );
}
