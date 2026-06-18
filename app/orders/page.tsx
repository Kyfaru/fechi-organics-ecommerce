import type { Metadata } from "next";
import { AccountOrdersClient } from "@/components/account/AccountOrdersClient";

export const metadata: Metadata = {
  title: "My Orders | Fechi Organics",
  description: "View your order history and track your deliveries.",
};

/**
 * /orders — Account orders page.
 * Server component shell — data fetching happens in AccountOrdersClient
 * via TanStack Query to enable optimistic UI and background refetching.
 */
export default function OrdersPage() {
  return <AccountOrdersClient />;
}
