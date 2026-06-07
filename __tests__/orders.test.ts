/**
 * Unit tests for app/api/orders/route.ts
 * Mocks: lib/auth.ts, lib/db.ts, lib/zoho.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
// Mock lib/zoho.ts (fire-and-forget — should NOT throw)
// ---------------------------------------------------------------------------
const mockZohoPost = vi.fn();
vi.mock("@/lib/zoho", () => ({
  zohoPost: (...args: unknown[]) => mockZohoPost(...args),
  ZohoApiError: class ZohoApiError extends Error {},
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockCartFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockProductUpdate = vi.fn();
const mockCartItemDeleteMany = vi.fn();
const mockUserFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    cart: {
      findUnique: (...args: unknown[]) => mockCartFindUnique(...args),
    },
    order: {
      create: (...args: unknown[]) => mockOrderCreate(...args),
      update: vi.fn(),
    },
    product: {
      update: (...args: unknown[]) => mockProductUpdate(...args),
    },
    cartItem: {
      deleteMany: (...args: unknown[]) => mockCartItemDeleteMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
}));

import { POST } from "@/app/api/orders/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOCK_SESSION = { user: { id: "user-1" } };

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeCartItem(overrides = {}) {
  return {
    id: "ci-1",
    cartId: "cart-1",
    productId: "prod-1",
    quantity: 2,
    product: {
      id: "prod-1",
      name: "Face Cream",
      priceKes: 150000,
      stock: 10,
      zohoItemId: "ZI-001",
    },
    ...overrides,
  };
}

const MOCK_CART = {
  id: "cart-1",
  userId: "user-1",
  items: [makeCartItem()],
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: authenticated
  mockGetSession.mockResolvedValue(MOCK_SESSION);
  // Default: cart with items
  mockCartFindUnique.mockResolvedValue(MOCK_CART);
  // Default: user for Zoho push
  mockUserFindUnique.mockResolvedValue({ name: "Test User", email: "test@test.com" });
  // Default: Zoho post succeeds
  mockZohoPost.mockResolvedValue({ salesorder: { salesorder_id: "SO-1" } });

  // Default transaction: execute the callback and return a mock order
  const MOCK_ORDER = { id: "order-123", userId: "user-1" };
  mockOrderCreate.mockResolvedValue(MOCK_ORDER);
  mockProductUpdate.mockResolvedValue({});
  mockCartItemDeleteMany.mockResolvedValue({ count: 1 });

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      order: { create: mockOrderCreate },
      product: { update: mockProductUpdate },
      cartItem: { deleteMany: mockCartItemDeleteMany },
    };
    return fn(tx);
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/orders", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("AUTH_REQUIRED");
  });

  it("returns 400 VALIDATION when cart is empty", async () => {
    mockCartFindUnique.mockResolvedValue({ id: "cart-1", userId: "user-1", items: [] });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
    expect(json.error.message).toContain("Cart is empty");
  });

  it("returns 400 VALIDATION when cart does not exist", async () => {
    mockCartFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
  });

  it("returns 400 VALIDATION when an item is out of stock — before any write", async () => {
    mockCartFindUnique.mockResolvedValue({
      ...MOCK_CART,
      items: [makeCartItem({ quantity: 20, product: { ...makeCartItem().product, stock: 5 } })],
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
    expect(json.error.message).toContain("out of stock");
    // Transaction must NOT have been called
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("creates order, decrements stock, clears cart, returns orderId", async () => {
    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.orderId).toBe("order-123");

    // Transaction was called
    expect(mockTransaction).toHaveBeenCalledOnce();
    // Order created
    expect(mockOrderCreate).toHaveBeenCalledOnce();
    // Stock decremented
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prod-1" },
        data: { stock: { decrement: 2 } },
      })
    );
    // Cart cleared
    expect(mockCartItemDeleteMany).toHaveBeenCalledWith({ where: { cartId: "cart-1" } });
  });

  it("order is still created even when Zoho push fails (fire-and-forget)", async () => {
    // Zoho post rejects immediately
    mockZohoPost.mockRejectedValue(new Error("Zoho unavailable"));

    const res = await POST(makeRequest());
    const json = await res.json();

    // Order should still have been created
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.orderId).toBe("order-123");
  });

  it("applies FECHI10 promo code — 10% discount on subtotal", async () => {
    const res = await POST(makeRequest({ promoCode: "FECHI10" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    // Verify order was created with discount
    const createArgs = mockOrderCreate.mock.calls[0][0];
    const subtotal = 150000 * 2; // priceKes * quantity
    const expectedDiscount = Math.round(subtotal * 0.1);
    expect(createArgs.data.discountKes).toBe(expectedDiscount);
    expect(createArgs.data.promoCode).toBe("FECHI10");
  });

  it("applies NEWUSER promo code — fixed 50000 KES cents discount", async () => {
    const res = await POST(makeRequest({ promoCode: "NEWUSER" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    const createArgs = mockOrderCreate.mock.calls[0][0];
    expect(createArgs.data.discountKes).toBe(50000);
  });
});
