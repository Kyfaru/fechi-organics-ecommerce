/**
 * Unit tests for lib/zoho-sync.ts
 * Mocks: zohoGet (lib/zoho.ts), db (lib/db.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock lib/zoho.ts
// ---------------------------------------------------------------------------
const mockZohoGet = vi.fn();
vi.mock("@/lib/zoho", () => ({
  zohoGet: (...args: unknown[]) => mockZohoGet(...args),
  ZohoApiError: class ZohoApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockProductUpsertCreate = vi.fn();
const mockProductUpsertUpdate = vi.fn();
const mockProductFindUnique = vi.fn();
const mockProductUpdateMany = vi.fn();
const mockCategoryFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findUnique: (...args: unknown[]) => mockProductFindUnique(...args),
      create: (...args: unknown[]) => mockProductUpsertCreate(...args),
      update: (...args: unknown[]) => mockProductUpsertUpdate(...args),
      updateMany: (...args: unknown[]) => mockProductUpdateMany(...args),
    },
    category: {
      findFirst: (...args: unknown[]) => mockCategoryFindFirst(...args),
    },
  },
}));

import { syncItemToProduct, syncAllItems, slugify } from "@/lib/zoho-sync";

const MOCK_CATEGORY = { id: "cat-1", name: "Face Care", isActive: true };

const makeItem = (overrides = {}) => ({
  item_id: "ZI-001",
  name: "Fechi Face Cream",
  status: "active",
  description: "Great cream",
  rate: 1500,
  quantity_available: 10,
  category_name: "Face Care",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing product
  mockProductFindUnique.mockResolvedValue(null);
  // Default: category found
  mockCategoryFindFirst.mockResolvedValue(MOCK_CATEGORY);
  // Default: creates succeed
  mockProductUpsertCreate.mockResolvedValue({ id: "prod-1" });
  mockProductUpsertUpdate.mockResolvedValue({ id: "prod-1" });
  mockProductUpdateMany.mockResolvedValue({ count: 0 });
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------
describe("slugify", () => {
  it("converts to lowercase with hyphens", () => {
    expect(slugify("Fechi Face Cream")).toBe("fechi-face-cream");
  });

  it("strips special characters", () => {
    expect(slugify("Aloe & Vera (50ml)")).toBe("aloe-vera-50ml");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("anti--aging")).toBe("anti-aging");
  });
});

// ---------------------------------------------------------------------------
// syncItemToProduct
// ---------------------------------------------------------------------------
describe("syncItemToProduct", () => {
  it("creates product with correct priceKes (rate * 100) and derived slug", async () => {
    await syncItemToProduct(makeItem());

    expect(mockProductUpsertCreate).toHaveBeenCalledOnce();
    const createCall = mockProductUpsertCreate.mock.calls[0][0];
    expect(createCall.data.priceKes).toBe(150000); // 1500 * 100
    expect(createCall.data.slug).toBe("fechi-face-cream");
    expect(createCall.data.zohoItemId).toBe("ZI-001");
    expect(createCall.data.isActive).toBe(true);
  });

  it("calls update (not create) when product with same zohoItemId already exists", async () => {
    mockProductFindUnique.mockResolvedValue({ id: "existing-prod-1", slug: "fechi-face-cream" });

    await syncItemToProduct(makeItem());

    expect(mockProductUpsertCreate).not.toHaveBeenCalled();
    expect(mockProductUpsertUpdate).toHaveBeenCalledOnce();
    const updateCall = mockProductUpsertUpdate.mock.calls[0][0];
    expect(updateCall.where.id).toBe("existing-prod-1");
    expect(updateCall.data.priceKes).toBe(150000);
  });

  it("sets isActive=false for inactive Zoho item", async () => {
    await syncItemToProduct(makeItem({ status: "inactive" }));

    expect(mockProductUpsertCreate).toHaveBeenCalledOnce();
    const createCall = mockProductUpsertCreate.mock.calls[0][0];
    expect(createCall.data.isActive).toBe(false);
  });

  it("falls back to first active category when category_name does not match", async () => {
    // First call (by name) returns null, second call (fallback) returns category
    mockCategoryFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(MOCK_CATEGORY);

    await syncItemToProduct(makeItem({ category_name: "Unknown Category" }));

    expect(mockProductUpsertCreate).toHaveBeenCalledOnce();
    const createCall = mockProductUpsertCreate.mock.calls[0][0];
    expect(createCall.data.categoryId).toBe("cat-1");
  });
});

// ---------------------------------------------------------------------------
// syncAllItems
// ---------------------------------------------------------------------------
describe("syncAllItems", () => {
  it("paginates when has_more_page is true", async () => {
    mockZohoGet
      .mockResolvedValueOnce({
        items: [makeItem({ item_id: "ZI-001", name: "Item 1" })],
        page_context: { has_more_page: true, page: 1 },
      })
      .mockResolvedValueOnce({
        items: [makeItem({ item_id: "ZI-002", name: "Item 2" })],
        page_context: { has_more_page: false, page: 2 },
      });

    const result = await syncAllItems();

    expect(mockZohoGet).toHaveBeenCalledTimes(2);
    expect(result.upserted).toBe(2);
  });

  it("returns upserted count equal to total items synced", async () => {
    mockZohoGet.mockResolvedValueOnce({
      items: [
        makeItem({ item_id: "ZI-A" }),
        makeItem({ item_id: "ZI-B" }),
        makeItem({ item_id: "ZI-C" }),
      ],
      page_context: { has_more_page: false, page: 1 },
    });

    const result = await syncAllItems();

    expect(result.upserted).toBe(3);
  });

  it("calls updateMany to deactivate products not returned by Zoho", async () => {
    mockZohoGet.mockResolvedValueOnce({
      items: [makeItem({ item_id: "ZI-001" })],
      page_context: { has_more_page: false, page: 1 },
    });
    mockProductUpdateMany.mockResolvedValue({ count: 2 });

    const result = await syncAllItems();

    expect(mockProductUpdateMany).toHaveBeenCalledOnce();
    // Should exclude the seen item from deactivation
    const updateCall = mockProductUpdateMany.mock.calls[0][0];
    expect(updateCall.data.isActive).toBe(false);
    expect(result.deactivated).toBe(2);
  });
});
