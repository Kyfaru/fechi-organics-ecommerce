import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { OrderErrorClient } from "@/components/checkout/OrderErrorClient";

export default async function OrderErrorPage({ params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!order || order.userId !== session.user.id) redirect("/orders");

  const failedOrder = order.paymentStatus === "FAILED"
    ? order
    : await db.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED", status: "PENDING" },
        include: { user: { select: { name: true, email: true } } },
      });

  return (
    <OrderErrorClient
      order={{
        id: failedOrder.id,
        totalKes: failedOrder.totalKes,
        customerName: failedOrder.user?.name ?? "there",
        location: [failedOrder.deliveryZone, failedOrder.deliveryCity, failedOrder.deliveryCounty].filter(Boolean).join(", "),
      }}
    />
  );
}
