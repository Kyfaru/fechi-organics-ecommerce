/**
 * PayHero API client — wraps the card payment initiation endpoint.
 *
 * Field names below are based on the documented API contract at
 * https://backend.payhero.co.ke/api/v2/payments. Verify them against a live
 * response before going to production — PayHero sometimes diverges from docs.
 *
 * Auth: HTTP Basic (PAYHERO_USERNAME:PAYHERO_PASSWORD, base64-encoded).
 */

// NOTE: PayHero field names may vary from their documentation.
// Verify request/response shapes against the live API before launch.
interface PayHeroPaymentRequest {
  amount: number;
  phone_number?: string;
  channel_id: number;
  provider: string;
  external_reference: string;
  callback_url: string;
  email?: string;
}

interface PayHeroPaymentResponse {
  success: boolean;
  response_code?: string;
  checkout_url?: string;
  reference?: string;
  // PayHero field names may vary — verify against live API docs
  [key: string]: unknown;
}

const PAYHERO_BASE = "https://backend.payhero.co.ke/api/v2";

/**
 * Initiates a card payment via PayHero.
 *
 * @param request - The payment payload (amount in whole KES, not cents)
 * @returns The raw PayHero response — caller must inspect `checkout_url` and `reference`
 * @throws Error if the HTTP response is not 2xx
 */
export async function createPayHeroPayment(
  request: PayHeroPaymentRequest,
): Promise<PayHeroPaymentResponse> {
  const username = process.env.PAYHERO_USERNAME!;
  const password = process.env.PAYHERO_PASSWORD!;
  const credentials = Buffer.from(`${username}:${password}`).toString("base64");

  const res = await fetch(`${PAYHERO_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayHero request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as PayHeroPaymentResponse;
}
