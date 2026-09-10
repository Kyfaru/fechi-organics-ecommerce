import { redirect } from "next/navigation";

/**
 * /orders — legacy route, superseded by /account/orders.
 * Redirects to the canonical account orders page.
 */
export default function OrdersPage() {
  redirect("/account/orders");
}
