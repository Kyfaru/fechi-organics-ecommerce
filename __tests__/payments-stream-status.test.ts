/**
 * app/api/payments/stream (one-shot SSE frame for finished orders) and
 * app/api/payments/status/[orderId] GET (the hook's fallback when SSE drops).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn().mockResolvedValue(null) } } }));
vi.mock("@/lib/redis", () => ({ getRedis: () => ({ get: vi.fn().mockResolvedValue(null) }) }));
vi.mock("@/lib/payment-channel", () => ({ paymentChannel: (id: string) => `payment:${id}` }));
vi.mock("@/lib/ratelimit", () => ({ makeRatelimit: () => null }));
vi.mock("@/lib/payments/guest-abuse-guard", () => ({ clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/origin-check", () => ({ assertTrustedOrigin: () => null }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/payments/post-payment", () => ({ markPaymentFailed: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const orderFindFirst = vi.fn();
const orderFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findFirst: (...a: unknown[]) => orderFindFirst(...a),
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
    },
  },
}));

import { GET as stream } from "@/app/api/payments/stream/route";
import { GET as status } from "@/app/api/payments/status/[orderId]/route";

const ID = "11111111-2222-3333-4444-555555555555";
const streamReq = () => new NextRequest(`http://localhost/api/payments/stream?orderId=${ID}`);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/payments/stream — finished orders", () => {
  it("answers a PAID order with a text/event-stream data frame (not JSON)", async () => {
    orderFindFirst.mockResolvedValue({ id: ID, paymentStatus: "PAID", status: "CONFIRMED" });
    const res = await stream(streamReq());
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text.startsWith("data: ")).toBe(true);
    expect(JSON.parse(text.slice(6))).toMatchObject({ type: "payment_success", immediate: true });
  });

  it("answers a FAILED order with a payment_failed frame", async () => {
    orderFindFirst.mockResolvedValue({ id: ID, paymentStatus: "FAILED", status: "FAILED" });
    const res = await stream(streamReq());
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(JSON.parse((await res.text()).slice(6))).toMatchObject({ type: "payment_failed" });
  });

  it("403s an unknown order", async () => {
    orderFindFirst.mockResolvedValue(null);
    expect((await stream(streamReq())).status).toBe(403);
  });
});

describe("GET /api/payments/status/[orderId]", () => {
  const call = (id: string) =>
    status(new NextRequest(`http://localhost/api/payments/status/${id}`), {
      params: Promise.resolve({ orderId: id }),
    });

  it("returns only the coarse paymentStatus", async () => {
    orderFindUnique.mockResolvedValue({ paymentStatus: "PAID" });
    const json = await (await call(ID)).json();
    expect(json).toMatchObject({ ok: true, data: { paymentStatus: "PAID" } });
  });

  it("404s an unknown order and 400s a malformed id", async () => {
    orderFindUnique.mockResolvedValue(null);
    expect((await call(ID)).status).toBe(404);
    expect((await call("short")).status).toBe(400);
  });
});
