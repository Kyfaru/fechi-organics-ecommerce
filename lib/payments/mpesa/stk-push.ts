/**
 * M-Pesa STK Push — initiates a Lipa Na M-Pesa Online (STK push) request
 * via the Safaricom Daraja API.
 *
 * Handles both PayBill and Till Number flows. The TransactionType changes
 * between them; the rest of the payload is identical.
 *
 * Phone normalisation: Kenyan numbers come in many formats. We always
 * coerce to the 254XXXXXXXXX format that Daraja expects.
 */

import { getDarajaToken } from "./daraja-client";
import { decrypt } from "@/lib/crypto";
import type { branch } from "@prisma/client";

const DARAJA_BASE =
  process.env.DARAJA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/**
 * Normalises a Kenyan phone number to the 254XXXXXXXXX format.
 *
 * Handles: 0712345678, +254712345678, 254712345678
 *
 * @param raw - Phone number in any common Kenyan format
 * @returns Normalised number starting with "254"
 * @throws Error if the resulting number does not look like a valid Kenyan number
 */
export function normalisePhone(raw: string): string {
  // Strip all non-digit characters (spaces, dashes, leading +)
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("254")) {
    // Already in international format
  } else if (digits.startsWith("0")) {
    // Local format: 0XXXXXXXXX → 254XXXXXXXXX
    digits = "254" + digits.slice(1);
  } else if (digits.length === 9) {
    // Bare local without leading 0: 7XXXXXXXX → 254XXXXXXXXX
    digits = "254" + digits;
  }

  if (!/^2547\d{8}$|^2541\d{8}$/.test(digits)) {
    throw new Error(
      `[stk-push] Invalid Kenyan phone number: "${raw}" → "${digits}"`,
    );
  }

  return digits;
}

/**
 * Builds the Daraja STK push password.
 *
 * Password = Base64(shortcode + passkey + timestamp)
 */
function buildPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

/**
 * Returns a timestamp string in the format YYYYMMDDHHmmss, as required by
 * the Daraja API.
 */
function darajaTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join("");
}

/**
 * Initiates an STK push request to the customer's phone.
 *
 * @param params.branch       - The branch whose Daraja credentials to use
 * @param params.phone        - Customer phone (any common Kenyan format)
 * @param params.amountKes    - Amount in whole KES (not cents)
 * @param params.orderId      - Our internal order ID — used as AccountReference
 * @param params.callbackUrl  - URL Safaricom will POST the result to
 * @returns Daraja STK push response containing CheckoutRequestID
 * @throws Error if Daraja rejects the request
 */
export async function initiateSTKPush(params: {
  branch: branch;
  phone: string;
  amountKes: number;
  orderId: string;
  callbackUrl: string;
}): Promise<STKPushResponse> {
  const { branch, phone, amountKes, orderId, callbackUrl } = params;

  const token = await getDarajaToken(branch);
  if (!branch.passkeyEnc) throw new Error(`[stk-push] Branch ${branch.id} has no passkey configured`);
  const passkey = decrypt(branch.passkeyEnc);
  const timestamp = darajaTimestamp();
  const normalised = normalisePhone(phone);
  const password = buildPassword(branch.shortcode, passkey, timestamp);

  // Sandbox only supports CustomerPayBillOnline with test shortcode 174379.
  // In production, use the correct type based on branch mpesaType.
  const isProduction = process.env.DARAJA_ENV === "production";
  const transactionType =
    !isProduction || branch.mpesaType === "PAYBILL"
      ? "CustomerPayBillOnline"
      : "CustomerBuyGoodsOnline";

  const payload = {
    BusinessShortCode: branch.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: transactionType,
    Amount: Math.round(amountKes), // Daraja requires a whole number
    PartyA: normalised,
    PartyB: branch.shortcode,
    PhoneNumber: normalised,
    CallBackURL: callbackUrl,
    AccountReference: orderId.slice(0, 12), // Daraja max length is 12 chars
    TransactionDesc: "Fechi Order",  // max 13 chars per Daraja spec
  };

  const res = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `[stk-push] Daraja request failed: ${res.status} ${res.statusText} — ${body}`,
    );
  }

  const data = (await res.json()) as STKPushResponse;

  if (data.ResponseCode !== "0") {
    throw new Error(
      `[stk-push] Daraja rejected the request: ${data.ResponseCode} — ${data.ResponseDescription}`,
    );
  }

  return data;
}
