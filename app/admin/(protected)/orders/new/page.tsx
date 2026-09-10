import { connection } from "next/server";
import { NewOrderClient } from "@/components/admin/orders/NewOrderClient";

export const metadata = { title: "New Order | Admin" };

// Forces a fresh remount of NewOrderClient on every navigation into this
// route. Without this, Next's router cache can keep the client component
// instance alive across navigations, leaving stale wizard state (cart lines,
// selected customer, etc.) from a previously started order. connection()
// opts this page out of static rendering under cacheComponents so a new key
// is generated per request rather than baked in at build time.
export default async function NewOrderPage() {
  await connection();
  return <NewOrderClient key={crypto.randomUUID()} />;
}
