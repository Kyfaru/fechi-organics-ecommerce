/**
 * Unit tests for lib/zoho-sync.ts
 * Mocks: zohoGet (lib/zoho.ts), db (lib/db.ts), createNotification (lib/notify.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_ORG_ID = "test-org-id";
const TEST_BRANCH_ID = "test-branch";

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
// Mock lib/notify.ts (LOW_STOCK notifications on a crossing-edge drop)
// ---------------------------------------------------------------------------
const mockCreateNotification = vi.fn();
vi.mock("@/lib/notify", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

// ---------------------------------------------------------------------------
// Mock lib/cache-tags.ts
// ---------------------------------------------------------------------------
vi.mock("@/lib/cache-tags", () => ({
  invalidateProductCache: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts — $transaction just invokes the callback with the same
// mock db, so tx.X and db.X share one set of assertable mocks.
// ---------------------------------------------------------------------------
const mockProductFindUnique = vi.fn();
const mockProductFindFirst = vi.fn();
const mockProductCreate = vi.fn();
const mockProductUpdate = vi.fn();
const mockCategoryFindFirst = vi.fn();
const mockCategoryFindUnique = vi.fn();
const mockMappingFindUnique = vi.fn();
const mockMappingCreate = vi.fn();
const mockMappingFindMany = vi.fn();
const mockMappingUpdateMany = vi.fn();
const mockStockFindUnique = vi.fn();
const mockStockUpsert = vi.fn();
const mockStockUpdateMany = vi.fn();
const mockBranchFindMany = vi.fn();
const mockTransaction = vi.fn();
const mockStagedFindUnique = vi.fn();
const mockStagedUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findUnique: (...args: unknown[]) => mockProductFindUnique(...args),
      findFirst: (...args: unknown[]) => mockProductFindFirst(...args),
      create: (...args: unknown[]) => mockProductCreate(...args),
      update: (...args: unknown[]) => mockProductUpdate(...args),
    },
    category: {
      findFirst: (...args: unknown[]) => mockCategoryFindFirst(...args),
      findUnique: (...args: unknown[]) => mockCategoryFindUnique(...args),
    },
    productZohoMapping: {
      findUnique: (...args: unknown[]) => mockMappingFindUnique(...args),
      create: (...args: unknown[]) => mockMappingCreate(...args),
      findMany: (...args: unknown[]) => mockMappingFindMany(...args),
      updateMany: (...args: unknown[]) => mockMappingUpdateMany(...args),
    },
    branchProductStock: {
      findUnique: (...args: unknown[]) => mockStockFindUnique(...args),
      upsert: (...args: unknown[]) => mockStockUpsert(...args),
      updateMany: (...args: unknown[]) => mockStockUpdateMany(...args),
    },
    branch: {
      findMany: (...args: unknown[]) => mockBranchFindMany(...args),
    },
    zohoStagedItem: {
      findUnique: (...args: unknown[]) => mockStagedFindUnique(...args),
      upsert: (...args: unknown[]) => mockStagedUpsert(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
}));

import { syncItemToProduct, syncAllItems, syncInventoryIds, slugify } from "@/lib/zoho-sync";

const MOCK_CATEGORY = { id: "cat-1", name: "Face Care", isActive: true };
const UNCATEGORIZED = { id: "cat-uncategorized", key: "UNCATEGORIZED" };
const ORG_BRANCHES = [{ id: TEST_BRANCH_ID }];

const makeItem = (overrides = {}) => ({
  item_id: "ZI-001",
  name: "Fechi Face Cream",
  status: "active",
  description: "Great cream",
  rate: 1500,
  stock_on_hand: 10,
  category_name: "Face Care",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing mapping for this item — create path
  mockMappingFindUnique.mockResolvedValue(null);
  // Default: category found by name
  mockCategoryFindFirst.mockResolvedValue(MOCK_CATEGORY);
  mockCategoryFindUnique.mockResolvedValue(UNCATEGORIZED);
  // Default: no slug collision
  mockProductFindUnique.mockResolvedValue(null);
  // Default: creates/updates succeed
  mockProductCreate.mockResolvedValue({ id: "prod-1", slug: "fechi-face-cream" });
  mockProductUpdate.mockResolvedValue({ id: "prod-1" });
  mockMappingCreate.mockResolvedValue({ id: "map-1" });
  // Default: no prior stock row (first sync)
  mockStockFindUnique.mockResolvedValue(null);
  mockStockUpsert.mockResolvedValue({ id: "stock-1" });
  mockStockUpdateMany.mockResolvedValue({ count: 0 });
  mockMappingFindMany.mockResolvedValue([]);
  mockBranchFindMany.mockResolvedValue(ORG_BRANCHES);
  mockProductFindFirst.mockResolvedValue(null);
  mockMappingUpdateMany.mockResolvedValue({ count: 0 });
  // Default: item has never been staged before — no existing zohoStagedItem row.
  mockStagedFindUnique.mockResolvedValue(null);
  mockStagedUpsert.mockResolvedValue({ id: "staged-1" });
  // db.$transaction(fn) just invokes fn with a tx exposing the same mocks
  // used for the non-transactional (db.*) calls above.
  mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({
      product: {
        update: (...args: unknown[]) => mockProductUpdate(...args),
        create: (...args: unknown[]) => mockProductCreate(...args),
      },
      productZohoMapping: { create: (...args: unknown[]) => mockMappingCreate(...args) },
      branchProductStock: {
        findUnique: (...args: unknown[]) => mockStockFindUnique(...args),
        upsert: (...args: unknown[]) => mockStockUpsert(...args),
      },
    }),
  );
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
  it("stages the item (never creates a live product) when no productZohoMapping exists", async () => {
    await syncItemToProduct(TEST_ORG_ID, makeItem(), ORG_BRANCHES);

    expect(mockProductCreate).not.toHaveBeenCalled();
    expect(mockMappingCreate).not.toHaveBeenCalled();

    expect(mockStagedUpsert).toHaveBeenCalledOnce();
    const upsertCall = mockStagedUpsert.mock.calls[0][0];
    expect(upsertCall.where.organizationId_zohoItemId).toEqual({ organizationId: TEST_ORG_ID, zohoItemId: "ZI-001" });
    expect(upsertCall.create.status).toBe("PENDING");
    expect(upsertCall.create.rateKes).toBe(150000); // 1500 * 100
    expect(upsertCall.create.description).toBe("Great cream");
    expect(upsertCall.update.rateKes).toBe(150000);
  });

  it("nulls description on stage when Zoho doesn't return one", async () => {
    await syncItemToProduct(TEST_ORG_ID, makeItem({ description: undefined }), ORG_BRANCHES);

    const upsertCall = mockStagedUpsert.mock.calls[0][0];
    expect(upsertCall.create.description).toBeNull();
  });

  it("nulls rateKes on stage when rate is missing (unlike promote, which defaults price to 0)", async () => {
    await syncItemToProduct(TEST_ORG_ID, makeItem({ rate: undefined }), ORG_BRANCHES);

    const upsertCall = mockStagedUpsert.mock.calls[0][0];
    expect(upsertCall.create.rateKes).toBeNull();
  });

  it("skips staging entirely (permanent guard) when this item was already excluded", async () => {
    mockStagedFindUnique.mockResolvedValue({ status: "EXCLUDED" });

    await syncItemToProduct(TEST_ORG_ID, makeItem(), ORG_BRANCHES);

    expect(mockStagedUpsert).not.toHaveBeenCalled();
    expect(mockProductCreate).not.toHaveBeenCalled();
  });

  it("does not touch branch stock or fire notifications while staging (no product exists yet)", async () => {
    await syncItemToProduct(TEST_ORG_ID, makeItem({ stock_on_hand: 7 }), ORG_BRANCHES);

    expect(mockStockUpsert).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("never falls back to UNCATEGORIZED while staging — categoryNameRaw is stored as-is for promote-time resolution", async () => {
    // matchedCategory is still looked up unconditionally before the
    // mapping/staging branch (shared code path for both), but staging never
    // reads the result or falls back to UNCATEGORIZED — that only happens
    // on the mapped-product path and at promote time.
    await syncItemToProduct(TEST_ORG_ID, makeItem({ category_name: "Face Care" }), ORG_BRANCHES);

    expect(mockCategoryFindUnique).not.toHaveBeenCalled();
    const upsertCall = mockStagedUpsert.mock.calls[0][0];
    expect(upsertCall.create.categoryNameRaw).toBe("Face Care");
  });

  it("calls update (not create) when a productZohoMapping already exists for this org", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "existing-prod-1" });
    mockProductFindUnique.mockResolvedValue({ id: "existing-prod-1", slug: "fechi-face-cream" });

    await syncItemToProduct(TEST_ORG_ID, makeItem(), ORG_BRANCHES);

    expect(mockProductCreate).not.toHaveBeenCalled();
    expect(mockMappingCreate).not.toHaveBeenCalled();
    expect(mockProductUpdate).toHaveBeenCalledOnce();
    const updateCall = mockProductUpdate.mock.calls[0][0];
    expect(updateCall.where.id).toBe("existing-prod-1");
    expect(updateCall.data.priceKes).toBe(150000);
  });

  it("leaves priceKes untouched on update when rate is missing (never nulls a checkout-critical field)", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "existing-prod-1" });
    mockProductFindUnique.mockResolvedValue({ id: "existing-prod-1", slug: "fechi-face-cream" });

    await syncItemToProduct(TEST_ORG_ID, makeItem({ rate: undefined }), ORG_BRANCHES);

    const updateCall = mockProductUpdate.mock.calls[0][0];
    expect(updateCall.data.priceKes).toBeUndefined();
  });

  it("leaves categoryId untouched on update when category_name does not match, but records the raw text", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "existing-prod-1" });
    mockProductFindUnique.mockResolvedValue({ id: "existing-prod-1", slug: "fechi-face-cream" });
    mockCategoryFindFirst.mockResolvedValue(null);

    await syncItemToProduct(TEST_ORG_ID, makeItem({ category_name: "Unknown Category" }), ORG_BRANCHES);

    const updateCall = mockProductUpdate.mock.calls[0][0];
    expect(updateCall.data.categoryId).toBeUndefined();
    expect(updateCall.data.zohoCategoryNameRaw).toBe("Unknown Category");
  });

  it("upserts branch-specific stock keyed on (branchId, productId), not the shared product row", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "existing-prod-1" });
    mockProductFindUnique.mockResolvedValue({ id: "existing-prod-1", slug: "fechi-face-cream" });

    await syncItemToProduct(TEST_ORG_ID, makeItem({ stock_on_hand: 42 }), ORG_BRANCHES);

    expect(mockStockUpsert).toHaveBeenCalledOnce();
    const upsertCall = mockStockUpsert.mock.calls[0][0];
    expect(upsertCall.where.branchId_productId).toEqual({ branchId: TEST_BRANCH_ID, productId: "existing-prod-1" });
    expect(upsertCall.create.stock).toBe(42);
    expect(upsertCall.update.stock).toBe(42);
  });

  it("splits stock across every branch in orgBranches", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "existing-prod-1" });
    mockProductFindUnique.mockResolvedValue({ id: "existing-prod-1", slug: "fechi-face-cream" });
    const branches = [
      { id: "branch-a" },
      { id: "branch-b" },
    ];

    await syncItemToProduct(TEST_ORG_ID, makeItem({ stock_on_hand: 7 }), branches);

    expect(mockStockUpsert).toHaveBeenCalledTimes(2);
    expect(mockStockUpsert.mock.calls[0][0].where.branchId_productId.branchId).toBe("branch-a");
    expect(mockStockUpsert.mock.calls[1][0].where.branchId_productId.branchId).toBe("branch-b");
  });

  it("fires a LOW_STOCK notification on a crossing-edge drop below threshold", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "existing-prod-1" });
    mockProductFindUnique.mockResolvedValue({ id: "existing-prod-1", slug: "fechi-face-cream" });
    mockStockFindUnique.mockResolvedValue({ stock: 15 }); // was above the 10-unit threshold

    await syncItemToProduct(TEST_ORG_ID, makeItem({ stock_on_hand: 5 }), ORG_BRANCHES);

    expect(mockCreateNotification).toHaveBeenCalledOnce();
    const call = mockCreateNotification.mock.calls[0][0];
    expect(call.type).toBe("LOW_STOCK");
    expect(call.branchId).toBe(TEST_BRANCH_ID);
  });

  it("does not re-fire when stock was already below threshold (no new crossing)", async () => {
    mockMappingFindUnique.mockResolvedValue({ productId: "existing-prod-1" });
    mockProductFindUnique.mockResolvedValue({ id: "existing-prod-1", slug: "fechi-face-cream" });
    mockStockFindUnique.mockResolvedValue({ stock: 4 }); // already low

    await syncItemToProduct(TEST_ORG_ID, makeItem({ stock_on_hand: 3 }), ORG_BRANCHES);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("skips the item without creating anything when item_id or name is missing", async () => {
    await syncItemToProduct(TEST_ORG_ID, makeItem({ name: undefined }), ORG_BRANCHES);

    expect(mockProductCreate).not.toHaveBeenCalled();
    expect(mockProductUpdate).not.toHaveBeenCalled();
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

    const result = await syncAllItems(TEST_ORG_ID);

    expect(mockZohoGet).toHaveBeenCalledTimes(2);
    expect(mockZohoGet.mock.calls[0][0]).toBe(TEST_ORG_ID);
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

    const result = await syncAllItems(TEST_ORG_ID);

    expect(result.upserted).toBe(3);
  });

  it("zeroes out stock (every branch in the org) for products mapped to this org but not returned by Zoho", async () => {
    mockZohoGet.mockResolvedValueOnce({
      items: [makeItem({ item_id: "ZI-001" })],
      page_context: { has_more_page: false, page: 1 },
    });
    mockMappingFindMany.mockResolvedValue([{ productId: "stale-prod-1" }, { productId: "stale-prod-2" }]);
    mockStockUpdateMany.mockResolvedValue({ count: 2 });

    const result = await syncAllItems(TEST_ORG_ID);

    expect(mockStockUpdateMany).toHaveBeenCalledOnce();
    const updateCall = mockStockUpdateMany.mock.calls[0][0];
    expect(updateCall.where.branchId).toEqual({ in: [TEST_BRANCH_ID] });
    expect(updateCall.where.productId).toEqual({ in: ["stale-prod-1", "stale-prod-2"] });
    expect(updateCall.data.stock).toBe(0);
    expect(result.deactivated).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// syncInventoryIds
// ---------------------------------------------------------------------------
describe("syncInventoryIds", () => {
  it("matches an Inventory item to an existing product by SKU and backfills zohoInventoryItemId onto its Books-sourced mapping", async () => {
    mockZohoGet.mockResolvedValueOnce({
      items: [makeItem({ item_id: "INV-001", sku: "FECHI-CREAM-50" })],
      page_context: { has_more_page: false, page: 1 },
    });
    mockProductFindFirst.mockResolvedValue({ id: "prod-1" });
    mockMappingUpdateMany.mockResolvedValue({ count: 1 });

    const result = await syncInventoryIds(TEST_ORG_ID);

    expect(mockZohoGet).toHaveBeenCalledWith(
      TEST_ORG_ID,
      "/items",
      expect.objectContaining({ page: "1" }),
      "inventory",
    );
    expect(mockProductFindFirst).toHaveBeenCalledWith({ where: { zohoSku: "FECHI-CREAM-50" }, select: { id: true } });
    expect(mockMappingUpdateMany).toHaveBeenCalledWith({
      where: { productId: "prod-1", organizationId: TEST_ORG_ID },
      data: { zohoInventoryItemId: "INV-001" },
    });
    expect(result).toEqual({ matched: 1, unmatched: 0 });
  });

  it("counts as unmatched when no product has that SKU", async () => {
    mockZohoGet.mockResolvedValueOnce({
      items: [makeItem({ item_id: "INV-002", sku: "UNKNOWN-SKU" })],
      page_context: { has_more_page: false, page: 1 },
    });
    mockProductFindFirst.mockResolvedValue(null);

    const result = await syncInventoryIds(TEST_ORG_ID);

    expect(mockMappingUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ matched: 0, unmatched: 1 });
  });

  it("counts as unmatched when the product exists but has no Books-sourced mapping for this org yet", async () => {
    mockZohoGet.mockResolvedValueOnce({
      items: [makeItem({ item_id: "INV-003", sku: "FECHI-CREAM-50" })],
      page_context: { has_more_page: false, page: 1 },
    });
    mockProductFindFirst.mockResolvedValue({ id: "prod-1" });
    mockMappingUpdateMany.mockResolvedValue({ count: 0 }); // matched a product, but no mapping row to update

    const result = await syncInventoryIds(TEST_ORG_ID);

    expect(result).toEqual({ matched: 0, unmatched: 1 });
  });

  it("counts as unmatched when an item has no sku at all", async () => {
    mockZohoGet.mockResolvedValueOnce({
      items: [makeItem({ item_id: "INV-004", sku: undefined })],
      page_context: { has_more_page: false, page: 1 },
    });

    const result = await syncInventoryIds(TEST_ORG_ID);

    expect(mockProductFindFirst).not.toHaveBeenCalled();
    expect(result).toEqual({ matched: 0, unmatched: 1 });
  });

  it("paginates across multiple pages", async () => {
    mockZohoGet
      .mockResolvedValueOnce({
        items: [makeItem({ item_id: "INV-001", sku: "SKU-A" })],
        page_context: { has_more_page: true, page: 1 },
      })
      .mockResolvedValueOnce({
        items: [makeItem({ item_id: "INV-002", sku: "SKU-B" })],
        page_context: { has_more_page: false, page: 2 },
      });
    mockProductFindFirst.mockResolvedValue({ id: "prod-1" });
    mockMappingUpdateMany.mockResolvedValue({ count: 1 });

    const result = await syncInventoryIds(TEST_ORG_ID);

    expect(mockZohoGet).toHaveBeenCalledTimes(2);
    expect(result.matched).toBe(2);
  });
});
