/**
 * Validation for admin coupon create/update.
 *
 * The promotions API had no schema at all — POST hand-rolled three `if` checks
 * and PATCH coerced whatever it was given. Now that a coupon can mint loyalty
 * points, the bounds have to be enforced somewhere the client cannot skip.
 *
 * Shared with the client so the drawer and the server agree on the limits.
 */

import { z } from "zod";

/** A single coupon may never carry more than this many points. */
export const MAX_COUPON_POINTS = 3000;

export const PROMOTION_TYPES = ["PERCENTAGE", "FIXED", "FREE_SHIPPING"] as const;

/** Cents. Empty string and null both mean "no value", not zero. */
const optionalCents = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });

const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : v));

const pointsAward = z.coerce
  .number()
  .int("Points must be a whole number")
  .min(0, "Points can't be negative")
  .max(MAX_COUPON_POINTS, `A coupon can carry at most ${MAX_COUPON_POINTS} points`);

const statusEnum = z.enum(["active", "inactive", "expired"]);
const maxUsesPerUser = z.coerce.number().int().min(0);

/**
 * Field validators shared by both schemas, minus defaults.
 *
 * Defaults belong to create only. `.partial()` does not strip `.default()`, so
 * a patch schema built from a defaulted shape would write those defaults on
 * every partial update — editing a coupon's status would silently reset its
 * points to 0.
 */
const sharedShape = {
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(PROMOTION_TYPES),
  value: z.coerce.number().min(0),
  code: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ? String(v).trim().toUpperCase() : null)),
  minOrder: optionalCents,
  maxUses: optionalCents,
  maxDiscountKes: optionalCents,
  startDate: optionalDate,
  endDate: optionalDate,
};

export const promotionCreateSchema = z
  .object({
    ...sharedShape,
    maxUsesPerUser: maxUsesPerUser.default(1),
    pointsAward: pointsAward.default(0),
    status: statusEnum.default("active"),
  })
  .strict()
  .refine((v) => v.type === "FREE_SHIPPING" || v.value > 0, {
    message: "Value is required unless the coupon is free shipping",
    path: ["value"],
  })
  .refine((v) => v.pointsAward === 0 || !!v.code, {
    // Points are credited when a specific code is redeemed, so a coupon that
    // carries points but has no code could never pay out.
    message: "A coupon that carries points needs a code",
    path: ["pointsAward"],
  });

/**
 * Every field optional and NO defaults — PATCH writes only what it was given,
 * so an unrelated edit can never reset a coupon's points or per-user limit.
 */
export const promotionPatchSchema = z
  .object({ ...sharedShape, maxUsesPerUser, pointsAward, status: statusEnum })
  .strict()
  .partial();

export type PromotionCreateInput = z.infer<typeof promotionCreateSchema>;
export type PromotionPatchInput = z.infer<typeof promotionPatchSchema>;
