import { db } from "@/lib/db";

export type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];
type DbOrTx = typeof db | TxClient;

// ---------------------------------------------------------------------------
// Generate a unique "#XXXX-DDMMYY" ticket number.
//
// digits 1-3 = random (000-999), digit 4 = running ticket count mod 10,
// suffix = today's date in EAT (Africa/Nairobi, fixed UTC+3 — no DST) as
// DDMMYY. Mirrors the EAT-conversion shape of buildTimestampOrderNumber in
// lib/orders/generate-order-number.ts.
//
// Why it exists: the contact-form path (`TKT-XXXXXXXX`) and the authenticated
// ticket-creation path (`TK-00001`) used two different, competing numbering
// schemes. This is the single shared generator both call sites use now.
//
// ticketNumber has a DB-level @unique constraint, so we retry the random
// prefix a few times on collision — same defensive pattern as
// generateOrderNumber, since the random-3-digits + count-mod-10 space is
// small enough to collide on a busy day.
// ---------------------------------------------------------------------------
export async function generateTicketNumber(client: DbOrTx = db): Promise<string> {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const day = String(eat.getUTCDate()).padStart(2, "0");
  const month = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const year = String(eat.getUTCFullYear() % 100).padStart(2, "0");
  const dateSuffix = `${day}${month}${year}`;

  const count = await client.supportTicket.count();
  const digit4 = count % 10;

  for (let i = 0; i < 5; i++) {
    const random3 = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    const candidate = `#${random3}${digit4}-${dateSuffix}`;
    const exists = await client.supportTicket.findUnique({ where: { ticketNumber: candidate } });
    if (!exists) return candidate;
  }
  throw new Error("Could not generate unique ticket number after 5 retries");
}
