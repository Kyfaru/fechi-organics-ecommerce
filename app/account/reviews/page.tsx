import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"

export const metadata = { title: "Write a Review | Fechi Organics" }

export default async function ReviewsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const orders = await db.order.findMany({
    where: {
      userId: session.user.id,
      status: { in: ["DELIVERED", "PICKED_UP"] },
      reviewedAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      items: { select: { name: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Write a Review</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
          Share your experience with Fechi Organics products
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-[#f0fdf4] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#15803D]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.601a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">No reviews to write</h3>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">
            Orders you receive will appear here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-neutral-900 dark:text-white text-[15px]">
                  Order #{order.orderNumber}
                </p>
                {order.items[0] && (
                  <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-0.5">
                    {order.items[0].name}{order.items.length > 1 ? ` +${order.items.length - 1} more` : ""}
                  </p>
                )}
                <span className="inline-block mt-2 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#15803D]">
                  {order.status === "PICKED_UP" ? "Picked Up" : "Delivered"}
                </span>
              </div>
              <Link
                href={`/account/reviews/${order.id}`}
                className="shrink-0 inline-flex items-center gap-2 bg-[#15803D] hover:bg-[#166534] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                Write Review
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
