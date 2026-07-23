/**
 * Unit tests for app/api/zoho/webhook/route.ts
 * Tests the POST handler directly (no real network/DB).
 *
 * The webhook is per-organization: each org's Zoho config POSTs to
 * ?organizationId=<id>, authenticated against that org's own encrypted
 * webhookSecretEnc. Several branches can share one org.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_ORG_ID = "org-1";
const TEST_BRANCH_ID = "branch-1";
const TEST_SECRET = "correct-secret";

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
  { token = TEST_SECRET as string | null, organizationId = TEST_ORG_ID as string | null } = {}
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== null) headers.set("x-zoho-webhook-token", token);
  const url = organizationId
    ? `http://localhost/api/zoho/webhook?organizationId=${organizationId}`
    : "http://localhost/api/zoho/webhook";
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOrgFindUnique.mockResolvedValue({ webhookSecretEnc: "encrypted-blob" });
  mockBranchFindMany.mockResolvedValue([{ id: TEST_BRANCH_ID, zohoWarehouseId: null }]);
  mockStockUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncItemToProduct.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/zoho/webhook", () => {
  it("returns 200 with valid org + token and item_updated event", async () => {
    const req = makeRequest({
      eventType: "item_updated",
      data: {
        item: {
          item_id: "ZI-001",
          name: "Cream",
          status: "active",
          description: "",
          rate: 500,
          quantity_available: 5,
          category_name: "Face",
        },
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockSyncItemToProduct).toHaveBeenCalledWith(
      TEST_ORG_ID,
      expect.objectContaining({ item_id: "ZI-001" }),
      [{ id: TEST_BRANCH_ID, zohoWarehouseId: null }],
    );
  });

  it("returns 400 when organizationId query param is missing", async () => {
    const req = makeRequest({ eventType: "item_updated", data: {} }, { organizationId: null });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when the organization has no Zoho webhook secret configured", async () => {
    mockOrgFindUnique.mockResolvedValue({ webhookSecretEnc: null });
    const req = makeRequest({ eventType: "item_updated", data: {} });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when webhook token is wrong", async () => {
    const req = makeRequest(
      { eventType: "item_updated", data: {} },
      { token: "wrong-token" }
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when webhook token header is missing", async () => {
    const req = makeRequest(
      { eventType: "item_updated", data: {} },
      { token: null }
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("zeroes out stock for every branch in the org on item_deleted, leaving the shared product row untouched", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "prod-1" });
    const req = makeRequest({
      eventType: "item_deleted",
      data: { item: { item_id: "ZI-001" } },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockStockUpdateMany).toHaveBeenCalledWith({
      where: { branchId: { in: [TEST_BRANCH_ID] }, productId: "prod-1" },
      data: { stock: 0 },
    });
  });

  it("returns 400 on malformed (non-JSON) body", async () => {
    const req = new NextRequest(`http://localhost/api/zoho/webhook?organizationId=${TEST_ORG_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zoho-webhook-token": TEST_SECRET,
      },
      body: "NOT_JSON{{{{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when eventType is missing", async () => {
    const req = makeRequest({ data: { item: {} } });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 even when syncItemToProduct throws (idempotent)", async () => {
    mockSyncItemToProduct.mockRejectedValue(new Error("DB error"));

    const req = makeRequest({
      eventType: "item_created",
      data: {
        item: { item_id: "ZI-002", name: "Test", status: "active", rate: 100 },
      },
    });

    const res = await POST(req);
    // Must still return 200 so Zoho does not retry
    expect(res.status).toBe(200);
  });
});
