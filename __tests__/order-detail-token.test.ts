import { describe, it, expect } from "vitest";
import { TimeSpan } from "oslo";
import { createOrderDetailToken, verifyOrderDetailToken } from "@/lib/order-detail-token";
import { createResetToken } from "@/lib/password-reset";

describe("order-detail-token", () => {
  it("round-trips a valid token", async () => {
    const token = await createOrderDetailToken("order-123", "order");
    const result = await verifyOrderDetailToken(token);

    expect(result).toEqual({ ok: true, orderId: "order-123", kind: "order" });
  });

  it("carries the 'instore' kind correctly", async () => {
    const token = await createOrderDetailToken("instore-456", "instore");
    const result = await verifyOrderDetailToken(token);

    expect(result).toEqual({ ok: true, orderId: "instore-456", kind: "instore" });
  });

  it("rejects an expired token", async () => {
    const token = await createOrderDetailToken("order-123", "order", new TimeSpan(-1, "s"));
    const result = await verifyOrderDetailToken(token);

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token issued for a different purpose", async () => {
    const token = await createResetToken("order-123");
    const result = await verifyOrderDetailToken(token);

    expect(result.ok).toBe(false);
  });

  it("rejects a tampered token", async () => {
    const token = await createOrderDetailToken("order-123", "order");
    const tampered = token.slice(0, -4) + "abcd";
    const result = await verifyOrderDetailToken(tampered);

    expect(result.ok).toBe(false);
  });
});
