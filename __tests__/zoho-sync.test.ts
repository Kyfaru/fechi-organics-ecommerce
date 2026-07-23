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
const mockProductCreate = vi.fn();
const mockProductUpdate = vi.fn();
const mockCategoryFindFirst = vi.fn();
const mockCategoryFindUnique = vi.fn();
const mockMappingFindUnique = vi.fn();
const mockMappingCreate = vi.fn();
const mockMappingFindMany = vi.fn();
const mockStockFindUnique = vi.fn();
const mockStockUpsert = vi.fn();
const mockStockUpdateMany = vi.fn();
const mockBranchFindMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findUnique: (...args: unknown[]) => mockProductFindUnique(...args),
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
    },
    branchProductStock: {
      findUnique: (...args: unknown[]) => mockStockFindUnique(...args),
      upsert: (...args: unknown[]) => mockStockUpsert(...args),
      updateMany: (...args: unknown[]) => mockStockUpdateMany(...args),
    },
    branch: {
      findMany: (...args: unknown[]) => mockBranchFindMany(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
}));

import { syncItemToProduct, syncAllItems, slugify } from "@/lib/zoho-sync";

const MOCK_CATEGORY = { id: "cat-1", name: "Face Care", isActive: true };
const UNCATEGORIZED = { id: "cat-uncategorized", key: "UNCATEGORIZED" };
const ORG_BRANCHES = [{ id: TEST_BRANCH_ID, zohoWarehouseId: null }];

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
  it("creates product with correct priceKes (rate * 100), derived slug, and a productZohoMapping row", async () => {
    await syncItemToProduct(TEST_ORG_ID, makeItem(), ORG_BRANCHES);

    expect(mockProductCreate).toHaveBeenCalledOnce();
    const createCall = mockProductCreate.mock.calls[0][0];
    expect(createCall.data.priceKes).toBe(150000); // 1500 * 100
    expect(createCall.data.slug).toBe("fechi-face-cream");
    expect(createCall.data.description).toBe("Great cream");

    expect(mockMappingCreate).toHaveBeenCalledOnce();
    const mappingCall = mockMappingCreate.mock.calls[0][0];
    expect(mappingCall.data).toEqual({ productId: "prod-1", organizationId: TEST_ORG_ID, zohoItemId: "ZI-001" });
  });

  it("nulls description on create when Zoho doesn't return one", async () => {
    await syncItemToProduct(TEST_ORG_ID, makeItem({ description: undefined }), ORG_BRANCHES);

    const createCall = mockProductCreate.mock.calls[0][0];
    expect(createCall.data.description).toBeNull();
  });

  it("defaults priceKes to 0 on create when rate is missing", async () => {
    await syncItemToProduct(TEST_ORG_ID, makeItem({ rate: undefined }), ORG_BRANCHES);

    const createCall = mockProductCreate.mock.calls[0][0];
    expect(createCall.data.priceKes).toBe(0);
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

  it("falls back to the UNCATEGORIZED category on create when category_name does not match", async () => {
    mockCategoryFindFirst.mockResolvedValue(null);

    await syncItemToProduct(TEST_ORG_ID, makeItem({ category_name: "Unknown Category" }), ORG_BRANCHES);

    expect(mockCategoryFindUnique).toHaveBeenCalledWith({ where: { key: "UNCATEGORIZED" } });
    expect(mockProductCreate).toHaveBeenCalledOnce();
    const createCall = mockProductCreate.mock.calls[0][0];
    expect(createCall.data.categoryId).toBe(UNCATEGORIZED.id);
    expect(createCall.data.zohoCategoryNameRaw).toBe("Unknown Category");
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
    await syncItemToProduct(TEST_ORG_ID, makeItem({ quantity_available: 42 }), ORG_BRANCHES);

    expect(mockStockUpsert).toHaveBeenCalledOnce();
    const upsertCall = mockStockUpsert.mock.calls[0][0];
    expect(upsertCall.where.branchId_productId).toEqual({ branchId: TEST_BRANCH_ID, productId: "prod-1" });
    expect(upsertCall.create.stock).toBe(42);
    expect(upsertCall.update.stock).toBe(42);
  });

  it("splits stock across every branch in orgBranches", async () => {
    const branches = [
      { id: "branch-a", zohoWarehouseId: null },
      { id: "branch-b", zohoWarehouseId: null },
    ];

    await syncItemToProduct(TEST_ORG_ID, makeItem({ quantity_available: 7 }), branches);

    expect(mockStockUpsert).toHaveBeenCalledTimes(2);
    expect(mockStockUpsert.mock.calls[0][0].where.branchId_productId.branchId).toBe("branch-a");
    expect(mockStockUpsert.mock.calls[1][0].where.branchId_productId.branchId).toBe("branch-b");
  });

  it("uses a matching warehouse entry's stock over the aggregate when the branch has a zohoWarehouseId", async () => {
    const branches = [{ id: TEST_BRANCH_ID, zohoWarehouseId: "wh-1" }];
    const item = makeItem({
      quantity_available: 100,
      warehouses: [{ warehouse_id: "wh-1", warehouse_available_stock: 6 }],
    });

    await syncItemToProduct(TEST_ORG_ID, item, branches);

    const upsertCall = mockStockUpsert.mock.calls[0][0];
    expect(upsertCall.create.stock).toBe(6);
  });

  it("fires a LOW_STOCK notification on a crossing-edge drop below threshold", async () => {
    mockStockFindUnique.mockResolvedValue({ stock: 15 }); // was above the 10-unit threshold

    await syncItemToProduct(TEST_ORG_ID, makeItem({ quantity_available: 5 }), ORG_BRANCHES);

    expect(mockCreateNotification).toHaveBeenCalledOnce();
    const call = mockCreateNotification.mock.calls[0][0];
    expect(call.type).toBe("LOW_STOCK");
    expect(call.branchId).toBe(TEST_BRANCH_ID);
  });

  it("does not re-fire when stock was already below threshold (no new crossing)", async () => {
    mockStockFindUnique.mockResolvedValue({ stock: 4 }); // already low

    await syncItemToProduct(TEST_ORG_ID, makeItem({ quantity_available: 3 }), ORG_BRANCHES);

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
