/**
 * Unit tests for lib/zoho/push-sale.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockZohoPost = vi.fn();
vi.mock("@/lib/zoho", () => ({
  zohoPost: (...args: unknown[]) => mockZohoPost(...args),
}));

const mockMappingFindMany = vi.fn();
const mockPushLogCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    productZohoMapping: { findMany: (...args: unknown[]) => mockMappingFindMany(...args) },
    zohoPushLog: { create: (...args: unknown[]) => mockPushLogCreate(...args) },
  },
}));

import { pushSaleToZoho } from "@/lib/zoho/push-sale";

const baseArgs = {
  organizationId: "org-1",
  branchId: "branch-1",
  referenceType: "order" as const,
  referenceId: "order-1",
  items: [{ productId: "prod-1", name: "Cream", quantity: 2, priceKes: 150000 }],
  notes: "test order",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMappingFindMany.mockResolvedValue([{ productId: "prod-1", zohoItemId: "ZI-001" }]);
  mockPushLogCreate.mockResolvedValue({ id: "log-1" });
});

describe("pushSaleToZoho", () => {
  it("resolves the mapped zohoItemId and posts a salesorder", async () => {
    mockZohoPost.mockResolvedValue({ salesorder: { salesorder_id: "SO-1" } });

    const result = await pushSaleToZoho(baseArgs);

    expect(result.salesorderId).toBe("SO-1");
    const [orgId, path, body] = mockZohoPost.mock.calls[0];
    expect(orgId).toBe("org-1");
    expect(path).toBe("/salesorders");
    expect(body.salesorder.line_items[0].item_id).toBe("ZI-001");
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", zohoRecordId: "SO-1" }) }),
    );
  });

  it("sends no item_id when a product has no mapping for this org", async () => {
    mockMappingFindMany.mockResolvedValue([]);
    mockZohoPost.mockResolvedValue({ salesorder: {} });

    await pushSaleToZoho(baseArgs);

    const body = mockZohoPost.mock.calls[0][2];
    expect(body.salesorder.line_items[0].item_id).toBeUndefined();
  });

  it("logs FAILED and re-throws when the Zoho call fails", async () => {
    mockZohoPost.mockRejectedValue(new Error("Zoho down"));

    await expect(pushSaleToZoho(baseArgs)).rejects.toThrow("Zoho down");
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});
