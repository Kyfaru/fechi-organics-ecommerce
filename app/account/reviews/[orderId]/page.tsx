import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import { ReviewForm } from "@/components/account/reviews/ReviewForm"

export const metadata = { title: "Write a Review | Fechi Organics" }

export default async function ReviewOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const order = await db.order.findFirst({
    where: {
      id: orderId,
      userId: session.user.id,
      status: { in: ["DELIVERED", "PICKED_UP"] },
    },
    select: {
      id: true,
      orderNumber: true,
      reviewedAt: true,
      items: { select: { name: true }, take: 3 },
    },
  })

  if (!order) notFound()
  if (order.reviewedAt) redirect("/account/reviews")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
          Review Order #{order.orderNumber}
        </h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
          {order.items.map(i => i.name).join(", ")}
        </p>
      </div>
      <ReviewForm orderId={orderId} />
    </div>
  )
}
