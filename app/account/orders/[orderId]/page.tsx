import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { r2PublicUrl } from "@/lib/r2"
import OrderDetailContent from "@/components/account/orders/OrderDetailContent"

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const { orderId } = await params
  // Admin "Copy Link" builds URLs from the public orderNumber (e.g. #FO-XXXXXXXX),
  // percent-encoding the '#' — decode explicitly so the OR lookup matches reliably
  // regardless of how the framework normalizes the raw param.
  const decodedOrderId = decodeURIComponent(orderId)
  const order = await db.order.findFirst({
    where: { userId: session.user.id, OR: [{ id: orderId }, { orderNumber: decodedOrderId }] },
    include: {
      items: {
        include: {
          product: {
            select: {
              images: { where: { isPrimary: true }, take: 1, select: { objectKey: true } },
            },
          },
        },
      },
      statusEvents: { orderBy: { occurredAt: "asc" } },
      transactions: { orderBy: { createdAt: "desc" }, take: 5 },
      branch: { select: { name: true, county: true, phone: true } },
    },
  })

  if (!order) notFound()

  const serialized = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    invoiceNumber: order.invoiceNumber,
    createdAt: order.createdAt.toISOString(),
    totalKes: order.totalKes,
    subtotalKes: order.subtotalKes,
    deliveryKes: order.deliveryKes,
    discountKes: order.discountKes,
    deliveryType: order.deliveryType,
    deliveryAddress: order.deliveryAddress,
    deliveryCity: order.deliveryCity,
    deliveryCounty: order.deliveryCounty,
    deliveryPhone: order.deliveryPhone,
    pickupCode: order.pickupCode,
    branch: order.branch,
    customerPickupConfirmedAt: order.customerPickupConfirmedAt?.toISOString() ?? null,
    staffPickupConfirmedAt: order.staffPickupConfirmedAt?.toISOString() ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      priceKes: item.priceKes,
      quantity: item.quantity,
      imageUrl: item.product.images[0]?.objectKey
        ? r2PublicUrl(item.product.images[0].objectKey)
        : null,
    })),
    transactions: order.transactions.map((t) => ({
      id: t.id,
      provider: t.provider,
      amount: t.amount,
      status: t.status,
      mpesaReceiptNumber: (t as any).mpesaReceiptNumber ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    statusEvents: order.statusEvents.map((e) => ({
      status: e.status,
      occurredAt: e.occurredAt.toISOString(),
      note: e.note,
    })),
  }

  return <OrderDetailContent order={serialized} />
}
