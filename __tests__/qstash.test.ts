/**
 * Unit tests for lib/qstash.ts's publishQstashJSON — specifically the
 * QSTASH_TOKEN-unset case. Found in review: the unconfigured-token stub
 * `qstash` client resolves with a truthy fake message
 * ({messageId: "qstash-disabled"}), not null. Callers that gate a
 * synchronous inline-dispatch fallback on `if (!published)` (the STK
 * dispatch initiate routes) would otherwise think a real QStash job was
 * enqueued when nothing was, never fall back, and silently drop the job —
 * an order stuck PENDING forever with no STK push ever sent and no
 * automatic cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("publishQstashJSON — QSTASH_TOKEN unset", () => {
  it("returns null (not a truthy stub result) even when the base URL IS configured", async () => {
    delete process.env.QSTASH_TOKEN;
    process.env.NEXT_PUBLIC_APP_URL = "https://fechiorganics.shop";
    const { publishQstashJSON } = await import("@/lib/qstash");

    const result = await publishQstashJSON("/api/admin/workers/dispatch-stk", { transactionId: "tx-1" });

    expect(result).toBeNull();
  });
});

describe("publishQstashJSON — base URL checks (unaffected by the token check)", () => {
  it("still returns null when the base URL is unset, even with a token configured", async () => {
    process.env.QSTASH_TOKEN = "test-token";
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.MPESA_CALLBACK_BASE_URL;
    const { publishQstashJSON } = await import("@/lib/qstash");

    const result = await publishQstashJSON("/api/admin/workers/dispatch-stk", { transactionId: "tx-1" });

    expect(result).toBeNull();
  });

  it("still refuses Upstash's own QStash endpoint as the destination base URL", async () => {
    process.env.QSTASH_TOKEN = "test-token";
    process.env.NEXT_PUBLIC_APP_URL = "https://qstash-eu-central-1.upstash.io";
    const { publishQstashJSON } = await import("@/lib/qstash");

    const result = await publishQstashJSON("/api/admin/workers/dispatch-stk", { transactionId: "tx-1" });

    expect(result).toBeNull();
  });
});

describe("publishQstashJSON — token and base URL both configured", () => {
  it("calls the real QStash client and returns its result", async () => {
    process.env.QSTASH_TOKEN = "test-token";
    process.env.NEXT_PUBLIC_APP_URL = "https://fechiorganics.shop";
    const mockPublishJSON = vi.fn().mockResolvedValue({ messageId: "real-message-id" });
    vi.doMock("@upstash/qstash", () => ({
      Client: function MockClient() {
        return { publishJSON: mockPublishJSON };
      },
      Receiver: function MockReceiver() {
        return { verify: vi.fn() };
      },
    }));

    const { publishQstashJSON } = await import("@/lib/qstash");
    const result = await publishQstashJSON("/api/admin/workers/dispatch-stk", { transactionId: "tx-1" }, { retries: 2 });

    expect(result).toEqual({ messageId: "real-message-id" });
    expect(mockPublishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://fechiorganics.shop/api/admin/workers/dispatch-stk",
        retries: 2,
      }),
    );
  });
});
