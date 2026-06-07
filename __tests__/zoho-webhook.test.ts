/**
 * Unit tests for app/api/zoho/webhook/route.ts
 * Tests the POST handler directly (no real network/DB).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockProductUpdateMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    product: {
      updateMany: (...args: unknown[]) => mockProductUpdateMany(...args),
    },
  },
}));

import { POST } from "@/app/api/zoho/webhook/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(
  body: unknown,
  token: string | null = "correct-secret"
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== null) {
    headers.set("x-zoho-webhook-token", token);
  }
  return new NextRequest("http://localhost/api/zoho/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZOHO_WEBHOOK_SECRET = "correct-secret";
  mockProductUpdateMany.mockResolvedValue({ count: 1 });
  mockSyncItemToProduct.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/zoho/webhook", () => {
  it("returns 200 with valid token and item_updated event", async () => {
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
    expect(mockSyncItemToProduct).toHaveBeenCalledOnce();
  });

  it("returns 403 when webhook token is wrong", async () => {
    const req = makeRequest(
      { eventType: "item_updated", data: {} },
      "wrong-token"
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when webhook token header is missing", async () => {
    const req = makeRequest(
      { eventType: "item_updated", data: {} },
      null
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("calls db.product.updateMany with isActive:false on item_deleted", async () => {
    const req = makeRequest({
      eventType: "item_deleted",
      data: { item: { item_id: "ZI-001" } },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockProductUpdateMany).toHaveBeenCalledWith({
      where: { zohoItemId: "ZI-001" },
      data: { isActive: false },
    });
  });

  it("returns 400 on malformed (non-JSON) body", async () => {
    const req = new NextRequest("http://localhost/api/zoho/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zoho-webhook-token": "correct-secret",
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
