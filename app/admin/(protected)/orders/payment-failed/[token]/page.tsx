import { db } from "@/lib/db";
import { verifyOrderDetailToken } from "@/lib/order-detail-token";
import { loadCallerContext } from "@/lib/require-permission";
import { Admin403 } from "@/components/admin/Admin403";
import { Mail, Phone, AlertTriangle } from "lucide-react";

const PROVIDER_LABELS: Record<string, string> = {
  MPESA: "M-Pesa", PAYSTACK: "Paystack", KCB: "KCB Buni",
  MPESA_STK: "M-Pesa", MPESA_C2B: "M-Pesa",
};

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—";
  return date.toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function PaymentFailedOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 1. Token must be a valid, unexpired, purpose-scoped grant for one order.
  const verified = await verifyOrderDetailToken(token);
  if (!verified.ok) return <Admin403 />;

  // 2. Defense in depth beyond the layout's own permission gate — re-resolve
  // the caller so branch-scoping (below) can trust ctx.branchId/isSuperAdmin.
  const ctx = await loadCallerContext();
  if (ctx.denied) return <Admin403 />;

  const { orderId, kind } = verified;

  const order = kind === "instore"
    ? await db.inStoreOrder.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          branch: { select: { id: true, name: true, phone: true, county: true } },
          transactions: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      })
    : await db.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          user: { select: { name: true, email: true, phone: true } },
          branch: { select: { id: true, name: true, phone: true, county: true } },
          transactions: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

  // Not found — including if a super admin deleted this order since the
  // notification was sent (the token's 14-day window makes that possible).
  // Treated the same as "no access" rather than a distinguishing 404.
  if (!order) return <Admin403 />;

  // 3. Branch scope — a non-super-admin with a branchId can only view orders
  // from their own branch. Unscoped (branchId === null) admins see every
  // branch here too, for consistency with the activity-log visibility rule.
  if (!ctx.isSuperAdmin && ctx.branchId && ctx.branchId !== order.branchId) {
    return <Admin403 />;
  }

  // Narrow via "customerName" in order (present only on inStoreOrder) rather
  // than re-checking `kind` — TS can't correlate order's type back to the
  // earlier kind-based query branch, but an in-operator check on the union
  // itself narrows reliably.
  const isInStore = "customerName" in order;
  const customerName = isInStore ? order.customerName : order.user?.name;
  const customerEmail = isInStore ? order.customerEmail : (order.user?.email ?? order.guestEmail);
  const customerPhone = isInStore ? order.customerPhone : (order.deliveryPhone ?? order.user?.phone);
  const latestTransaction = order.transactions[0];
  const failureReason = latestTransaction?.failureReason ?? "No failure reason on file.";
  const orderRef = order.orderNumber ?? `#${order.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="max-w-[720px] mx-auto px-6 py-8">
      <div className="flex items-start gap-4 bg-(--danger-bg) border border-(--danger)/20 rounded-[12px] p-5 mb-6">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0">
          <AlertTriangle size={20} className="text-(--danger)" />
        </div>
        <div>
          <h1 className="font-syne text-[18px] font-semibold text-(--neutral-900) mb-1">Payment Failed — {orderRef}</h1>
          <p className="font-dm text-[14px] text-(--neutral-700)">{failureReason}</p>
          {latestTransaction && (
            <p className="font-dm text-[12px] text-(--neutral-500) mt-1">
              {PROVIDER_LABELS[latestTransaction.provider] ?? latestTransaction.provider} — {formatDateTime(latestTransaction.updatedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
          <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Customer</p>
          <p className="font-dm text-[14px] font-medium text-(--neutral-900)">{customerName ?? "—"}</p>
          <div className="flex flex-col gap-2 mt-3">
            {customerEmail && (
              <a href={`mailto:${customerEmail}`} className="flex items-center gap-2 font-dm text-[13px] text-(--green-800) hover:underline">
                <Mail size={14} /> {customerEmail}
              </a>
            )}
            {customerPhone && (
              <a href={`tel:${customerPhone}`} className="flex items-center gap-2 font-dm text-[13px] text-(--green-800) hover:underline">
                <Phone size={14} /> {customerPhone}
              </a>
            )}
            {!customerEmail && !customerPhone && (
              <p className="font-dm text-[13px] text-(--neutral-400)">No contact information on file</p>
            )}
          </div>
        </div>

        <div className="bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
          <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-2">Order</p>
          <p className="font-dm text-[13px] text-(--neutral-700)">Branch: {order.branch?.name ?? "—"}</p>
          <p className="font-dm text-[13px] text-(--neutral-700)">Placed: {formatDateTime(order.createdAt)}</p>
          <p className="font-syne text-[16px] font-semibold text-(--neutral-900) mt-2">{kes(order.totalKes)}</p>
        </div>
      </div>

      <div className="bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
        <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-3">Items</p>
        <div className="flex flex-col gap-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between font-dm text-[13px] text-(--neutral-700)">
              <span>{item.name} × {item.quantity}</span>
              <span>{kes(item.priceKes * item.quantity)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
