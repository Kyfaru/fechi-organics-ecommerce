/**
 * Unit tests for surfacing in-store orders inside the admin orders list, and
 * the in-store pickup transition:
 *  - app/api/admin/orders/route.ts — GET without a session (403), and the
 *    merged-list status-filter logic (CONFIRMED/PICKED_UP apply to both
 *    tables, any other status excludes in-store rows entirely)
 *  - app/api/admin/orders/instore/[id]/pickup/route.ts — NOT_PAID and
 *    ALREADY_PICKED_UP rejections
 *
 * Mocks: @/lib/auth, @/lib/db (same pattern as __tests__/instore-payments.test.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock next/server's connection() — outside a real Next request lifecycle
// (as in this Vitest environment) it throws "called outside a request scope"
// on this Next version. Pre-existing repo-wide issue (see
// __tests__/blog-schedule-publish.test.ts), not something introduced by
// these routes — stubbed here only, real NextRequest/NextResponse untouched.
// ---------------------------------------------------------------------------
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: async () => {} };
});

// ---------------------------------------------------------------------------
// Mock lib/auth.ts
// ---------------------------------------------------------------------------
const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockUserFindUnique = vi.fn();
const mockOrderFindMany = vi.fn();
const mockInStoreOrderFindMany = vi.fn();
const mockInStoreOrderFindUnique = vi.fn();
const mockInStoreOrderUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    order: { findMany: (...args: unknown[]) => mockOrderFindMany(...args) },
    inStoreOrder: {
      findMany: (...args: unknown[]) => mockInStoreOrderFindMany(...args),
      findUnique: (...args: unknown[]) => mockInStoreOrderFindUnique(...args),
      update: (...args: unknown[]) => mockInStoreOrderUpdate(...args),
    },
  },
}));

import { GET as ordersGET } from "@/app/api/admin/orders/route";
import { POST as pickupPOST } from "@/app/api/admin/orders/instore/[id]/pickup/route";

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function makePostRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "POST" });
}

const ADMIN_SESSION = { user: { id: "admin-1" } };
const SUPER_ADMIN = {
  id: "admin-1",
  role: "admin",
  adminProfile: { isSuperAdmin: true, branchId: null },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/admin/orders
// ---------------------------------------------------------------------------
describe("GET /api/admin/orders", () => {
  it("returns 403 when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await ordersGET(makeGetRequest("http://localhost/api/admin/orders"));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    // Must reject before ever touching either orders table.
    expect(mockOrderFindMany).not.toHaveBeenCalled();
    expect(mockInStoreOrderFindMany).not.toHaveBeenCalled();
  });

  it("includes in-store rows when filtering by status=CONFIRMED, sorted newest first", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue(SUPER_ADMIN);
    mockOrderFindMany.mockResolvedValue([
      { id: "order-1", createdAt: new Date("2026-07-08T10:00:00Z"), status: "CONFIRMED" },
    ]);
    mockInStoreOrderFindMany.mockResolvedValue([
      { id: "instore-1", createdAt: new Date("2026-07-09T10:00:00Z"), fulfillmentStatus: "CONFIRMED" },
    ]);

    const res = await ordersGET(
      makeGetRequest("http://localhost/api/admin/orders?status=CONFIRMED"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockInStoreOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ fulfillmentStatus: "CONFIRMED" }) }),
    );
    expect(json.data.orders).toHaveLength(2);
    // Newer in-store row sorts ahead of the older regular order.
    expect(json.data.orders[0].kind).toBe("instore");
    expect(json.data.orders[0].id).toBe("instore-1");
    expect(json.data.orders[1].kind).toBe("order");
  });

  it("excludes all in-store rows when filtering by a status with no in-store equivalent", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue(SUPER_ADMIN);
    mockOrderFindMany.mockResolvedValue([
      { id: "order-1", createdAt: new Date("2026-07-08T10:00:00Z"), status: "SHIPPED" },
    ]);

    const res = await ordersGET(
      makeGetRequest("http://localhost/api/admin/orders?status=SHIPPED"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    // SHIPPED has no in-store equivalent — the in-store table is never queried.
    expect(mockInStoreOrderFindMany).not.toHaveBeenCalled();
    expect(json.data.orders).toHaveLength(1);
    expect(json.data.orders[0].kind).toBe("order");
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/instore/[id]/pickup
// ---------------------------------------------------------------------------
describe("POST /api/admin/orders/instore/[id]/pickup", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockUserFindUnique.mockResolvedValue(SUPER_ADMIN);
  });

  it("rejects with 400 NOT_PAID when the order hasn't been paid yet", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({
      id: "order-1",
      branchId: "branch-1",
      paymentStatus: "PENDING",
      fulfillmentStatus: "CONFIRMED",
    });

    const res = await pickupPOST(
      makePostRequest("http://localhost/api/admin/orders/instore/order-1/pickup"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("NOT_PAID");
    expect(mockInStoreOrderUpdate).not.toHaveBeenCalled();
  });

  it("rejects with 400 ALREADY_PICKED_UP when the order was already marked picked up", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({
      id: "order-1",
      branchId: "branch-1",
      paymentStatus: "PAID",
      fulfillmentStatus: "PICKED_UP",
    });

    const res = await pickupPOST(
      makePostRequest("http://localhost/api/admin/orders/instore/order-1/pickup"),
      { params: Promise.resolve({ id: "order-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("ALREADY_PICKED_UP");
    expect(mockInStoreOrderUpdate).not.toHaveBeenCalled();
  });

  it("marks a paid, confirmed order as picked up", async () => {
    mockInStoreOrderFindUnique.mockResolvedValue({
      id: "order-1",
      branchId: "branch-1",
      paymentStatus: "PAID",
      fulfillmentStatus: "CONFIRMED",
    });

    const res = await pickupPOST(
      makePostRequest("http://localhost/api/admin/orders/instore/order-1/pickup"),
      { params: Promise.resolve({ id: "order-1" }) },
    );

    expect(res.status).toBe(200);
    expect(mockInStoreOrderUpdate).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { fulfillmentStatus: "PICKED_UP", pickedUpAt: expect.any(Date) },
    });
  });
});
