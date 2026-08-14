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
