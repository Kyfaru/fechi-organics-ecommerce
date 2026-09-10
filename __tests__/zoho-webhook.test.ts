/**
 * Unit tests for app/api/zoho/webhook/route.ts
 * Tests the POST handler directly (no real network/DB).
 *
 * The webhook is per-organization: each org's Zoho config POSTs to
 * ?organizationId=<id>&event=<event>, authenticated against this org's own
 * encrypted webhookSecretEnc via an HMAC-SHA256 signature header. Several
 * branches can share one org.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const TEST_ORG_ID = "org-1";
const TEST_BRANCH_ID = "branch-1";
const TEST_SECRET = "correct-secret";

function sign(body: string, secret: string = TEST_SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ---------------------------------------------------------------------------
// Mock lib/zoho-sync.ts
// ---------------------------------------------------------------------------
const mockSyncItemToProduct = vi.fn();
vi.mock("@/lib/zoho-sync", () => ({
  syncItemToProduct: (...args: unknown[]) => mockSyncItemToProduct(...args),
  syncAllItems: vi.fn(),
  slugify: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock lib/crypto.ts — decrypt just returns a fixed test secret, independent
// of whatever ciphertext-looking string the org mock stores.
// ---------------------------------------------------------------------------
vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(() => TEST_SECRET),
  encrypt: vi.fn((s: string) => s),
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockOrgFindUnique = vi.fn();
const mockMappingFindUnique = vi.fn();
const mockBranchFindMany = vi.fn();
const mockStockUpdateMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    zohoOrganization: {
      findUnique: (...args: unknown[]) => mockOrgFindUnique(...args),
    },
    productZohoMapping: {
      findUnique: (...args: unknown[]) => mockMappingFindUnique(...args),
    },
    branch: {
      findMany: (...args: unknown[]) => mockBranchFindMany(...args),
    },
    branchProductStock: {
      updateMany: (...args: unknown[]) => mockStockUpdateMany(...args),
    },
  },
}));

import { POST } from "@/app/api/zoho/webhook/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(
  body: unknown,
  {
    signature,
    organizationId = TEST_ORG_ID as string | null,
    event = "item_updated" as string | null,
  }: { signature?: string | null; organizationId?: string | null; event?: string | null } = {},
): NextRequest {
  const raw = JSON.stringify(body);
  const sig = signature === undefined ? sign(raw) : signature;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (sig !== null) headers.set("x-zoho-webhook-signature", sig);
  const params = new URLSearchParams();
  if (organizationId !== null) params.set("organizationId", organizationId);
  if (event !== null) params.set("event", event);
  return new NextRequest(`http://localhost/api/zoho/webhook?${params.toString()}`, {
    method: "POST",
    headers,
    body: raw,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOrgFindUnique.mockResolvedValue({ webhookSecretEnc: "encrypted-blob" });
  mockBranchFindMany.mockResolvedValue([{ id: TEST_BRANCH_ID }]);
  mockStockUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncItemToProduct.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/zoho/webhook", () => {
  it("returns 200 with a valid signature and item_updated event", async () => {
    const req = makeRequest(
      {
        item: {
          item_id: "ZI-001",
          name: "Cream",
          status: "active",
          description: "",
          rate: 500,
          stock_on_hand: 5,
          category_name: "Face",
        },
      },
      { event: "item_updated" },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockSyncItemToProduct).toHaveBeenCalledWith(
      TEST_ORG_ID,
      expect.objectContaining({ item_id: "ZI-001" }),
      [{ id: TEST_BRANCH_ID }],
    );
  });

  it("returns 400 when organizationId query param is missing", async () => {
    const req = makeRequest({ item: {} }, { organizationId: null });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when event query param is missing", async () => {
    const req = makeRequest({ item: {} }, { event: null });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when the organization has no Zoho webhook secret configured", async () => {
    mockOrgFindUnique.mockResolvedValue({ webhookSecretEnc: null });
    const req = makeRequest({ item: {} });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when the signature is wrong", async () => {
    const req = makeRequest({ item: {} }, { signature: sign(JSON.stringify({ item: {} }), "wrong-secret") });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when the signature header is missing", async () => {
    const req = makeRequest({ item: {} }, { signature: null });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("zeroes out stock for every branch in the org on item_deleted, leaving the shared product row untouched", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "prod-1" });
    const req = makeRequest({ item: { item_id: "ZI-001" } }, { event: "item_deleted" });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockStockUpdateMany).toHaveBeenCalledWith({
      where: { branchId: { in: [TEST_BRANCH_ID] }, productId: "prod-1" },
      data: { stock: 0 },
    });
  });

  it("returns 400 on malformed (non-JSON) body", async () => {
    const raw = "NOT_JSON{{{{";
    const req = new NextRequest(`http://localhost/api/zoho/webhook?organizationId=${TEST_ORG_ID}&event=item_updated`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zoho-webhook-signature": sign(raw),
      },
      body: raw,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 even when syncItemToProduct throws (idempotent)", async () => {
    mockSyncItemToProduct.mockRejectedValue(new Error("DB error"));

    const req = makeRequest(
      { item: { item_id: "ZI-002", name: "Test", status: "active", rate: 100 } },
      { event: "item_created" },
    );

    const res = await POST(req);
    // Must still return 200 so Zoho does not retry
    expect(res.status).toBe(200);
  });

  it("returns 200 and logs, ignoring an unrecognized event", async () => {
    const req = makeRequest({ item: {} }, { event: "something_unknown" });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSyncItemToProduct).not.toHaveBeenCalled();
  });
});
