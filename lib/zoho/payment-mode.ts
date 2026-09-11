import type { PaymentProvider, InStoreProvider } from "@prisma/client";

/**
 * Maps this app's payment providers onto the Zoho Books "Payment Mode"
 * strings configured for these orgs (Settings → Payment Modes). Org A
 * (Nairobi/Nakuru) settles via KCB Buni, Org B (Kitengela/Eldoret/Mwea) via
 * M-Pesa Daraja — both are M-Pesa to the customer, but distinct settlement
 * rails Books needs to tell apart, hence the split rather than one "Mpesa".
 *
 * UNVERIFIED — these exact strings must match what's configured in Zoho
 * Books' Payment Modes settings for both orgs; adjust if casing/labels differ.
 */
export function paymentModeForOnline(provider: PaymentProvider): string {
  switch (provider) {
    case "KCB":
      return "Mpesa(KCB)";
    case "MPESA":
      return "Mpesa(Daraja)";
    case "PAYSTACK":
      return "Paystack";
    case "POINTS":
      // No cash settled. The receipt still balances because the points are
      // itemised as a negative line (see lib/zoho/push-sale-receipt.ts), so
      // this reads as a fully-discounted sale rather than unpaid revenue.
      // UNVERIFIED — must exist in Zoho Books' Payment Modes for both orgs.
      return "Fechi Points";
  }
}

export function paymentModeForInStore(provider: InStoreProvider): string {
  switch (provider) {
    case "MPESA_STK":
    case "MPESA_C2B":
      return "Mpesa(Daraja)";
    case "PAYSTACK":
      return "Paystack";
  }
}
