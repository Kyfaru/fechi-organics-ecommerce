import { z } from "zod";

/**
 * Shared shape of the `deliveryData` object every payment-initiate route
 * receives. Kept in one place so the checkout payload (components/checkout/DeliveryClient.tsx)
 * and the server-side validation can't drift out of sync — a mismatch here
 * makes `.strict()` reject every checkout request.
 */
export const deliveryDataSchema = z.object({
  fullName: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().min(9),
  email: z.string().email().optional(),
  country: z.string().min(2).default("KE"),
  countryName: z.string().optional(),
  county: z.string().optional().default(""),
  state: z.string().optional(),
  zoneId: z.string().optional().nullable(),
  deliveryZone: z.string().optional().nullable(),
  deliveryKes: z.number().int().nonnegative().optional(),
  deliveryFeeLabel: z.string().optional(),
  promoCode: z.string().optional().nullable(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]),
  branchId: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
  // Client-computed hint only, used to hide/show the card option in the UI.
  // The server always recomputes eligibility itself (lib/payments/card-eligibility.ts)
  // rather than trusting this value.
  isCardEligible: z.boolean().optional(),
}).strict();
