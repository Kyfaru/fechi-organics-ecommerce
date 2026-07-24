/**
 * Unit tests for lib/zoho/push-adjustment.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockZohoPost = vi.fn();
vi.mock("@/lib/zoho", () => ({
  zohoPost: (...args: unknown[]) => mockZohoPost(...args),
}));

const mockMappingFindUnique = vi.fn();
const mockBranchFindUnique = vi.fn();
const mockPushLogCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    productZohoMapping: { findUnique: (...args: unknown[]) => mockMappingFindUnique(...args) },
    branch: { findUnique: (...args: unknown[]) => mockBranchFindUnique(...args) },
    zohoPushLog: { create: (...args: unknown[]) => mockPushLogCreate(...args) },
  },
}));

import { pushInventoryAdjustmentToZoho } from "@/lib/zoho/push-adjustment";

const baseArgs = {
  organizationId: "org-1",
  branchId: "branch-1",
  productId: "prod-1",
  quantityAdjusted: -3,
  reason: "Stock count correction",
  referenceNumber: "ADJ-branch1-123",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMappingFindUnique.mockResolvedValue({ zohoItemId: "ZI-001" });
  mockBranchFindUnique.mockResolvedValue({ zohoWarehouseId: null });
  mockPushLogCreate.mockResolvedValue({ id: "log-1" });
});

describe("pushInventoryAdjustmentToZoho", () => {
  it("posts an inventory adjustment with the signed delta", async () => {
    mockZohoPost.mockResolvedValue({ inventory_adjustment: { inventory_adjustment_id: "IA-1" } });

    const result = await pushInventoryAdjustmentToZoho(baseArgs);

    expect(result.adjustmentId).toBe("IA-1");
    const [orgId, path, body] = mockZohoPost.mock.calls[0];
    expect(orgId).toBe("org-1");
    expect(path).toBe("/inventoryadjustments");
    expect(body.line_items[0]).toEqual(expect.objectContaining({ item_id: "ZI-001", quantity_adjusted: -3 }));
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }),
    );
  });

  it("skips the Zoho call and logs SKIPPED when there's no product mapping for this org", async () => {
    mockMappingFindUnique.mockResolvedValue(null);

    const result = await pushInventoryAdjustmentToZoho(baseArgs);

    expect(result.adjustmentId).toBeNull();
    expect(mockZohoPost).not.toHaveBeenCalled();
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }),
    );
  });

  it("returns null (never throws) and logs FAILED when the Zoho call fails", async () => {
    mockZohoPost.mockRejectedValue(new Error("Zoho down"));

    const result = await pushInventoryAdjustmentToZoho(baseArgs);

    expect(result.adjustmentId).toBeNull();
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});
