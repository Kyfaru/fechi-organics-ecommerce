export type AccountUser = {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
  username: string | null
  email: string
  image: string | null
  phone: string | null
  phoneCode: string | null
  country: string | null
  city: string | null
  usernameChanges: number
  lastUsernameChange: Date | null
  langPreference: string
  currencyDisplay: string
  notifBotanicalUpdates: boolean
  notifOrderTracking: boolean
  notifPersonalized: boolean
  twoFactorEnabled: boolean
}

export type OrderStatusValue =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "WAITING_TO_PACKAGE"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "CANCELLED"

// Client-facing display labels — admin panel keeps the raw enum names
export const ORDER_STATUS_CLIENT_LABELS: Record<OrderStatusValue, string> = {
  PENDING:            "Order Placed",
  CONFIRMED:          "Confirmed",
  PROCESSING:         "Waiting to be Shipped",
  SHIPPED:            "Shipped",
  DELIVERED:          "Delivered",
  WAITING_TO_PACKAGE: "Waiting to be Packaged",
  READY_FOR_PICKUP:   "Available for Pickup",
  PICKED_UP:          "Picked Up",
  CANCELLED:          "Cancelled",
}

export type MessageTypeValue = "ORDER_UPDATE" | "SYSTEM" | "PROMOTION" | "ALERT"

export type InboxMessage = {
  id: string
  type: MessageTypeValue
  title: string
  body: string
  orderId: string | null
  isRead: boolean
  createdAt: Date
}

export type WishlistItem = {
  id: string
  productId: string
  productName: string
  productImage: string | null
  priceKes: number
  originalPriceKes: number | null
  addedAt: Date
}
