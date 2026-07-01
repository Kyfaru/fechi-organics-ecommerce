import { Suspense } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { r2PublicUrl } from "@/lib/r2"
import type { OrderStatus } from "@prisma/client"
import OrderCard from "@/components/account/orders/OrderCard"
import OrderTabs from "@/components/account/orders/OrderTabs"
import PageHeader from "@/components/account/PageHeader"

const ONGOING: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "WAITING_TO_PACKAGE", "READY_FOR_PICKUP"]
const DELIVERED: OrderStatus[] = ["DELIVERED", "PICKED_UP"]
const CANCELLED: OrderStatus[] = ["CANCELLED"]

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")

  const { tab: tabParam, page: pageParam } = await searchParams

  const tab = tabParam ?? "all"
  const page = Math.max(1, parseInt(pageParam ?? "1"))
  const take = 10

  const statusFilter: OrderStatus[] | undefined =
    tab === "ongoing" ? ONGOING :
    tab === "delivered" ? DELIVERED :
    tab === "cancelled" ? CANCELLED :
    undefined

  const where = {
    userId: session.user.id,
    ...(statusFilter ? { status: { in: statusFilter } } : {}),
  }

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        totalKes: true,
        deliveryType: true,
        items: {
          take: 1,
          select: {
            product: {
              select: {
                images: { where: { isPrimary: true }, take: 1, select: { objectKey: true } },
              },
            },
          },
        },
        _count: { select: { items: true } },
      },
    }),
    db.order.count({ where }),
  ])

  const pages = Math.ceil(total / take)

  return (
    <div className="space-y-6">
      <PageHeader
        icon="lucide:shopping-bag"
        eyebrow="Order History"
        title="My Orders"
        description={`${total} order${total !== 1 ? "s" : ""} total`}
      />

      <Suspense>
        <OrderTabs active={tab} />
      </Suspense>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4 text-3xl">
            📦
          </div>
          <p className="text-neutral-500 font-medium">No orders found</p>
          <p className="text-sm text-neutral-400 mt-1">
            {tab === "all" ? "You haven't placed any orders yet." : `No ${tab} orders.`}
          </p>
          <Link
            href="/shop"
            className="mt-4 px-5 py-2 rounded-lg bg-[#15803D] text-white text-sm font-medium hover:bg-[#16A34A] transition-colors"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              id={o.id}
              orderNumber={o.orderNumber}
              status={o.status}
              createdAt={o.createdAt}
              totalKes={o.totalKes}
              thumbnail={
                o.items[0]?.product.images[0]?.objectKey
                  ? r2PublicUrl(o.items[0].product.images[0].objectKey)
                  : null
              }
              itemCount={o._count.items}
              deliveryType={o.deliveryType}
            />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-neutral-500">Page {page} of {pages}</p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?tab=${tab}&page=${page - 1}`} className="px-4 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`?tab=${tab}&page=${page + 1}`} className="px-4 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
