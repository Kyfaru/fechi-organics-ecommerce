import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();
let redisDown = false;
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: async (k: string) => { if (redisDown) throw new Error("redis down"); return store.get(k) ?? null; },
    set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
      if (redisDown) throw new Error("redis down");
      if (o?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
  }),
}));

vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { getOrMintToken } from "@/lib/payments/token-cache";

const mint = (t: string, expiresInS = 3600) => vi.fn(async () => ({ token: t, expiresInS }));

describe("getOrMintToken", () => {
  beforeEach(() => { store.clear(); redisDown = false; });

  it("mints once, then serves from cache", async () => {
    const m = mint("a");
    expect((await getOrMintToken("k", m)).cached).toBe(false);
    const r = await getOrMintToken("k", m);
    expect(r).toEqual({ token: "a", cached: true });
    expect(m).toHaveBeenCalledTimes(1);
  });

  it("re-mints a token inside the refresh margin", async () => {
    store.set("k", JSON.stringify({ token: "old", expiresAt: Date.now() + 100_000 }));
    const r = await getOrMintToken("k", mint("new"));
    expect(r).toEqual({ token: "new", cached: false });
  });

  it("re-mints a legacy bare-string entry", async () => {
    store.set("k", "legacy.jwt.token");
    expect((await getOrMintToken("k", mint("new"))).token).toBe("new");
  });

  it("still mints a token when Redis is down", async () => {
    redisDown = true;
    expect(await getOrMintToken("k", mint("minted"))).toEqual({ token: "minted", cached: false });
  });

  it("fresh=true bypasses a valid cache", async () => {
    await getOrMintToken("k", mint("a"));
    store.delete("k:lock");
    expect((await getOrMintToken("k", mint("b"), { fresh: true })).token).toBe("b");
  });
});
