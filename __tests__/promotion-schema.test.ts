import { describe, it, expect } from "vitest";
import {
  promotionCreateSchema,
  promotionPatchSchema,
  MAX_COUPON_POINTS,
} from "@/lib/promotions/schema";

/**
 * The promotions API had no schema at all before this — POST hand-rolled three
 * `if` checks and PATCH coerced whatever it was handed. Now that a coupon can
 * mint loyalty points, the ceiling has to hold server-side.
 */

const valid = {
  name: "Launch offer",
  type: "PERCENTAGE" as const,
  value: 10,
  code: "LAUNCH10",
};

describe("promotionCreateSchema", () => {
  it("accepts a plain coupon and defaults points to zero", () => {
    const r = promotionCreateSchema.parse(valid);
    expect(r.pointsAward).toBe(0);
    expect(r.status).toBe("active");
    expect(r.maxUsesPerUser).toBe(1);
  });

  it("uppercases and trims the code", () => {
    expect(promotionCreateSchema.parse({ ...valid, code: "  launch10 " }).code).toBe("LAUNCH10");
  });

  it("accepts points up to the ceiling", () => {
    expect(promotionCreateSchema.parse({ ...valid, pointsAward: MAX_COUPON_POINTS }).pointsAward)
      .toBe(MAX_COUPON_POINTS);
  });

  it("rejects points above the ceiling", () => {
    const r = promotionCreateSchema.safeParse({ ...valid, pointsAward: MAX_COUPON_POINTS + 1 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/at most 3000/);
  });

  it("rejects negative and fractional points", () => {
    expect(promotionCreateSchema.safeParse({ ...valid, pointsAward: -1 }).success).toBe(false);
    expect(promotionCreateSchema.safeParse({ ...valid, pointsAward: 10.5 }).success).toBe(false);
  });

  it("rejects a points-carrying coupon with no code", () => {
    // Points are credited when a specific code is redeemed, so this could
    // never pay out.
    const r = promotionCreateSchema.safeParse({ ...valid, code: null, pointsAward: 500 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/needs a code/);
  });

  it("requires a name", () => {
    expect(promotionCreateSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });

  it("requires a value unless the coupon is free shipping", () => {
    expect(promotionCreateSchema.safeParse({ ...valid, value: 0 }).success).toBe(false);
    expect(
      promotionCreateSchema.safeParse({ name: "Ship", type: "FREE_SHIPPING", value: 0 }).success,
    ).toBe(true);
  });

  it("treats empty strings as absent, not zero", () => {
    const r = promotionCreateSchema.parse({ ...valid, minOrder: "", maxDiscountKes: "" });
    expect(r.minOrder).toBeNull();
    expect(r.maxDiscountKes).toBeNull();
  });

  it("keeps a genuine zero minimum", () => {
    // The old PATCH used `body.minOrder ? ... : null`, which silently turned a
    // real 0 into "no minimum".
    expect(promotionCreateSchema.parse({ ...valid, minOrder: 0 }).minOrder).toBe(0);
  });

  it("rejects unknown fields", () => {
    expect(
      promotionCreateSchema.safeParse({ ...valid, ownerUserId: "someone" }).success,
    ).toBe(false);
  });
});

describe("promotionPatchSchema", () => {
  it("accepts a partial update", () => {
    expect(promotionPatchSchema.parse({ status: "inactive" })).toEqual({ status: "inactive" });
  });

  it("still enforces the points ceiling on an update", () => {
    // The whole reason PATCH needed a schema: create-then-edit was the way
    // around the create-time limit.
    expect(promotionPatchSchema.safeParse({ pointsAward: 99_999 }).success).toBe(false);
  });
});
