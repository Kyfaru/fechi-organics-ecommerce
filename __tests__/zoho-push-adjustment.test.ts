/**
 * Unit tests for lib/zoho/push-adjustment.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockZohoPost = vi.fn();
vi.mock("@/lib/zoho", () => ({
  zohoPost: (...args: unknown[]) => mockZohoPost(...args),
}));

const mockMappingFindMany = vi.fn();
const mockBranchFindUnique = vi.fn();
const mockPushLogCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    productZohoMapping: { findMany: (...args: unknown[]) => mockMappingFindMany(...args) },
    branch: { findUnique: (...args: unknown[]) => mockBranchFindUnique(...args) },
    zohoPushLog: { create: (...args: unknown[]) => mockPushLogCreate(...args) },
  },
}));

import { pushInventoryAdjustmentToZoho } from "@/lib/zoho/push-adjustment";

const baseArgs = {
  organizationId: "org-1",
  branchId: "branch-1",
  referenceType: "order" as const,
  referenceId: "order-1",
  referenceNumber: "FO-0001",
  items: [
    { productId: "prod-1", quantity: 2 },
    { productId: "prod-2", quantity: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMappingFindMany.mockResolvedValue([
    { productId: "prod-1", zohoItemId: "BOOKS-1", zohoInventoryItemId: "INV-1" },
    { productId: "prod-2", zohoItemId: "BOOKS-2", zohoInventoryItemId: null },
  ]);
  mockBranchFindUnique.mockResolvedValue({ zohoWarehouseId: null });
  mockPushLogCreate.mockResolvedValue({ id: "log-1" });
});

describe("pushInventoryAdjustmentToZoho", () => {
  it("posts one adjustment with a negative quantity per line item, preferring zohoInventoryItemId and falling back to zohoItemId", async () => {
    mockZohoPost.mockResolvedValue({ inventory_adjustment: { inventory_adjustment_id: "IA-1" } });

    const result = await pushInventoryAdjustmentToZoho(baseArgs);

    expect(result.adjustmentId).toBe("IA-1");
    const [orgId, path, body, product] = mockZohoPost.mock.calls[0];
    expect(orgId).toBe("org-1");
    expect(path).toBe("/inventoryadjustments");
    expect(product).toBe("inventory");
    expect(body.adjustment_type).toBe("quantity");
    expect(body.reference_number).toBe("FO-0001");
    expect(body.line_items).toEqual([
      { item_id: "INV-1", quantity_adjusted: -2 }, // prefers zohoInventoryItemId
      { item_id: "BOOKS-2", quantity_adjusted: -1 }, // falls back to zohoItemId
    ]);

    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", kind: "INVENTORY_ADJUSTMENT", zohoRecordId: "IA-1" }) }),
    );
  });

  it("includes location_id on every line item when the branch has a warehouse configured", async () => {
    mockBranchFindUnique.mockResolvedValue({ zohoWarehouseId: "wh-1" });
    mockZohoPost.mockResolvedValue({ inventory_adjustment: {} });

    await pushInventoryAdjustmentToZoho(baseArgs);

    const body = mockZohoPost.mock.calls[0][2];
    expect(body.line_items[0].location_id).toBe("wh-1");
    expect(body.line_items[1].location_id).toBe("wh-1");
  });

  it("skips the Zoho call and logs SKIPPED when no item in the sale has any mapping", async () => {
    mockMappingFindMany.mockResolvedValue([]);

    const result = await pushInventoryAdjustmentToZoho(baseArgs);

    expect(result.adjustmentId).toBeNull();
    expect(mockZohoPost).not.toHaveBeenCalled();
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED", kind: "INVENTORY_ADJUSTMENT" }) }),
    );
  });

  it("never throws — logs FAILED and returns a null adjustmentId when the Zoho call fails", async () => {
    mockZohoPost.mockRejectedValue(new Error("Zoho down"));

    const result = await pushInventoryAdjustmentToZoho(baseArgs);

    expect(result.adjustmentId).toBeNull();
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", kind: "INVENTORY_ADJUSTMENT" }) }),
    );
  });
});
