import type { InitTxInput, PaystackInitResponse, PaystackVerifyResponse } from "./types";

const BASE = "https://api.paystack.co";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function initializeTransaction(
  input: InitTxInput,
): Promise<PaystackInitResponse> {
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      email: input.email,
      amount: input.amount,
      reference: input.reference,
      subaccount: input.subaccount,
      bearer: "subaccount",
      transaction_charge: 0,
      ...(input.callback_url ? { callback_url: input.callback_url } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Paystack init failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<PaystackInitResponse>;
}

export async function verifyTransaction(
  reference: string,
): Promise<PaystackVerifyResponse> {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Paystack verify failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<PaystackVerifyResponse>;
}
