import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { OrderSuccessClient } from "@/components/checkout/OrderSuccessClient";

// Guest-checkout capable: a guest has no session to check ownership against,
// so the orderId itself (an unguessable UUID handed only to the browser that
// placed the order) is the proof, same model as GET /api/payments/stream.
// A logged-in visitor still gets the stricter session-based ownership check.
export default async function OrderSuccessPage({ params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });

  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true, phone: true, name: true } }, branch: { select: { name: true } } },
  });

  if (!order) redirect("/");
  if (session?.user && order.userId !== session.user.id) redirect(`/account/orders/${orderId}`);

  // This page only ever DISPLAYS the order — it must never be what marks a
  // payment as successful (that's markPaymentSuccess(), triggered solely by
  // a verified gateway callback). Anything else would let anyone who knows
  // an orderId complete that order for free just by loading this URL.
  if (order.paymentStatus !== "PAID") redirect(`/payment/${order.id}/processing`);

  return (
    <OrderSuccessClient
      order={{
        id: order.id,
        createdAt: order.createdAt.toISOString(),
        totalKes: order.totalKes,
        email: order.user?.email ?? order.guestEmail ?? "",
        phone: order.deliveryPhone ?? order.user?.phone ?? "",
        customerName: order.user?.name ?? "there",
        location: order.deliveryType === "PICKUP"
          ? order.branch?.name ?? "selected store"
          : [order.deliveryZone, order.deliveryCity, order.deliveryCounty].filter(Boolean).join(", "),
        items: order.items.map((item) => item.name),
      }}
    />
  );
}
