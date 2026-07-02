import { db } from "@/lib/db";

export type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Generate a unique "#FO-XXXXXXXX" order number with collision retry.
//
// Why it exists: order numbers are customer-facing and must be unique and
// human-readable, but random suffixes can theoretically collide — retry a
// few times inside the caller's transaction before giving up. Shared by
// order creation (assigns on checkout) and payment success (assigns the
// instant a payment confirms, for orders created without one yet).
// ---------------------------------------------------------------------------
export async function generateOrderNumber(tx: TxClient): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 5; i++) {
    const suffix = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * 36)]).join("");
    const num = `#FO-${suffix}`;
    const exists = await tx.order.findUnique({ where: { orderNumber: num } });
    if (!exists) return num;
  }
  throw new Error("Could not generate unique order number after 5 retries");
}
