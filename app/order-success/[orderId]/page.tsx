import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { OrderSuccessClient } from "@/components/checkout/OrderSuccessClient";

export default async function OrderSuccessPage({ params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true, phone: true, name: true } }, branch: { select: { name: true } } },
  });

  if (!order || order.userId !== session.user.id) redirect(`/account/orders/${orderId}`);

  const paidOrder = order.paymentStatus === "PAID"
    ? order
    : await db.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", status: "CONFIRMED" },
        include: { items: true, user: { select: { email: true, phone: true, name: true } }, branch: { select: { name: true } } },
      });

  return (
    <OrderSuccessClient
      order={{
        id: paidOrder.id,
        createdAt: paidOrder.createdAt.toISOString(),
        totalKes: paidOrder.totalKes,
        email: paidOrder.user?.email ?? paidOrder.guestEmail ?? "",
        phone: paidOrder.deliveryPhone ?? paidOrder.user?.phone ?? "",
        customerName: paidOrder.user?.name ?? "there",
        location: paidOrder.deliveryType === "PICKUP"
          ? paidOrder.branch?.name ?? "selected store"
          : [paidOrder.deliveryZone, paidOrder.deliveryCity, paidOrder.deliveryCounty].filter(Boolean).join(", "),
        items: paidOrder.items.map((item) => item.name),
      }}
    />
  );
}
