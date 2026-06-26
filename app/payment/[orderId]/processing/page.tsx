import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { r2PublicUrl } from "@/lib/r2";
import { PaymentProcessingClient } from "@/components/checkout/PaymentProcessingClient";

export default async function PaymentProcessingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ method?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { orderId } = await params;
  const { method } = await searchParams;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
          },
        },
      },
      transactions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!order || order.userId !== session.user.id) redirect("/orders");

  return (
    <PaymentProcessingClient
      method="mpesa"
      order={{
        id: order.id,
        createdAt: order.createdAt.toISOString(),
        totalKes: order.totalKes,
        deliveryType: order.deliveryType,
        deliveryCounty: order.deliveryCounty,
        deliveryCity: order.deliveryCity,
        deliveryZone: order.deliveryZone,
        branchId: order.branchId,
        items: order.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          imageUrl: item.product.images[0]?.objectKey ? r2PublicUrl(item.product.images[0].objectKey) : null,
        })),
        failureReason: order.transactions[0]?.failureReason ?? null,
      }}
    />
  );
}
