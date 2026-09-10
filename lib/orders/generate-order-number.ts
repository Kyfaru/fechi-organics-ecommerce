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

// 31-letter ASCII alphabet, 1-indexed by day-of-month (1-31).
const ALPHABET = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M",
  "N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
  "AA","AB","AC","AD","AE"
];

function yearLetter(year: number): string {
  const digit = year % 10;
  const position = digit === 0 ? 10 : digit; // 0 -> 10th letter (clock-face style)
  return String.fromCharCode(64 + position); // A=65
}

const LETTERS_POSITION: Record<"MPESA" | "PAYSTACK" | "KCB", "front" | "back"> = {
  MPESA: "front",
  KCB: "front",
  PAYSTACK: "back",
};

// ---------------------------------------------------------------------------
// Build a deterministic "#FO-..." order number that encodes the moment the
// order was placed, in EAT (Africa/Nairobi, fixed UTC+3 — Kenya has no DST).
//
// digits = month(no leading zero) + weekday(Mon=1..Sun=7) + hour + minute + second
// letters = yearLetter (alphabet position of the year's last digit) + dayLetter
//           (day-of-month, 1-indexed into the ASCII alphabet)
// Mpesa/KCB put the letters first, Paystack puts them last.
//
// ponytail: no uniqueness retry loop here — the value is a deterministic
// function of time, not random, so retrying wouldn't reliably produce a
// different value. A genuine same-second collision surfaces as a DB unique
// constraint error from order.create(), which the caller already catches.
// Add a resample-and-retry if that's ever observed in practice.
// ---------------------------------------------------------------------------
export function buildTimestampOrderNumber(
  date: Date,
  provider: "MPESA" | "PAYSTACK" | "KCB",
): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const month = eat.getUTCMonth() + 1;
  const weekday = eat.getUTCDay() === 0 ? 7 : eat.getUTCDay();
  const hour = String(eat.getUTCHours()).padStart(2, "0");
  const minute = String(eat.getUTCMinutes()).padStart(2, "0");
  const second = String(eat.getUTCSeconds()).padStart(2, "0");
  const digits = `${month}${weekday}${hour}${minute}${second}`;

  const letters = `${yearLetter(eat.getUTCFullYear())}${ALPHABET[eat.getUTCDate() - 1]}`;

  const body = LETTERS_POSITION[provider] === "front" ? `${letters}${digits}` : `${digits}${letters}`;
  return `#FO-${body}`;
}
