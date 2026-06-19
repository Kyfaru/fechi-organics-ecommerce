import { db } from "@/lib/db";
import { exampleZoneById } from "@/lib/delivery-zone-examples";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";

export type DeliveryPricingInput = {
  country: string;
  county?: string | null;
  zoneId?: string | null;
  deliveryType: "PICKUP" | "DELIVERY";
};

export type DeliveryPricingResult = {
  feeKes: number;
  currency: "KES";
  label: string;
};

const KENYA_FALLBACK_FEE = 35000;

const EAST_AFRICA = new Set(["UG", "TZ", "RW", "BI", "SS", "ET", "SO"]);
const REST_AFRICA = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "CM", "CV", "CF", "TD", "KM", "CG", "CD",
  "CI", "DJ", "EG", "GQ", "ER", "SZ", "GA", "GM", "GH", "GN", "GW", "LS",
  "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG",
  "ST", "SN", "SC", "SL", "ZA", "SD", "TG", "TN", "ZM", "ZW",
]);
const MIDDLE_EAST = new Set(["AE", "BH", "CY", "IL", "IQ", "IR", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "TR", "YE"]);
const HIGH_COST = new Set(["AU", "CA", "GB", "US", "NZ"]);
const EUROPE = new Set([
  "AL", "AD", "AT", "BE", "BG", "CH", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC",
  "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI",
  "SK", "SM", "UA", "VA",
]);

export async function calculateDeliveryPricing(input: DeliveryPricingInput): Promise<DeliveryPricingResult> {
  const country = input.country.toUpperCase();

  if (input.deliveryType === "PICKUP") {
    return { feeKes: 0, currency: "KES", label: "Free pickup" };
  }

  if (country === "KE") {
    if (input.zoneId) {
      const exampleZone = exampleZoneById(input.zoneId);
      if (exampleZone) {
        return { feeKes: exampleZone.deliveryFeeKes, currency: "KES", label: exampleZone.name };
      }

      const zone = await db.deliveryZone
        .findFirst({
          where: { id: input.zoneId, isActive: true },
          select: { deliveryFeeKes: true, name: true },
        })
        .catch((error) => {
          if (isPrismaTableMissingError(error)) return null;
          throw error;
        });
      if (zone) {
        return { feeKes: zone.deliveryFeeKes, currency: "KES", label: zone.name };
      }
    }
    return { feeKes: KENYA_FALLBACK_FEE, currency: "KES", label: "Kenya delivery" };
  }

  if (process.env.DHL_API_KEY) {
    // DHL integration point. Until DHL credentials/endpoints are configured,
    // continue to use deterministic regional fallback rates.
  }

  if (EAST_AFRICA.has(country)) {
    return { feeKes: 350000, currency: "KES", label: "East Africa flat rate" };
  }
  if (REST_AFRICA.has(country)) {
    return { feeKes: 600000, currency: "KES", label: "Africa flat rate" };
  }
  if (MIDDLE_EAST.has(country)) {
    return { feeKes: 800000, currency: "KES", label: "Middle East flat rate" };
  }
  if (HIGH_COST.has(country) || EUROPE.has(country)) {
    return { feeKes: 1200000, currency: "KES", label: "International priority flat rate" };
  }
  return { feeKes: 1000000, currency: "KES", label: "International flat rate" };
}
