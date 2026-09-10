/**
 * Unit tests for lib/zoho/push-sale-receipt.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockZohoPost = vi.fn();
vi.mock("@/lib/zoho", () => ({
  zohoPost: (...args: unknown[]) => mockZohoPost(...args),
}));

const mockResolveZohoCustomer = vi.fn();
vi.mock("@/lib/zoho/resolve-customer", () => ({
  resolveZohoCustomer: (...args: unknown[]) => mockResolveZohoCustomer(...args),
}));

const mockMappingFindMany = vi.fn();
const mockPushLogCreate = vi.fn();
const mockBranchFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    productZohoMapping: { findMany: (...args: unknown[]) => mockMappingFindMany(...args) },
    zohoPushLog: { create: (...args: unknown[]) => mockPushLogCreate(...args) },
    branch: { findUnique: (...args: unknown[]) => mockBranchFindUnique(...args) },
  },
}));

import { pushSaleReceiptToZoho } from "@/lib/zoho/push-sale-receipt";

const baseArgs = {
  organizationId: "org-1",
  branchId: "branch-1",
  referenceType: "order" as const,
  referenceId: "order-1",
  referenceNumber: "FO-0001",
  customerEmail: "customer@example.com",
  customerName: "Jane Doe",
  paymentMode: "Mpesa(Daraja)",
  items: [{ productId: "prod-1", name: "Cream", quantity: 2, priceKes: 150000 }],
  notes: "test order",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMappingFindMany.mockResolvedValue([{ productId: "prod-1", zohoItemId: "ZI-001" }]);
  mockResolveZohoCustomer.mockResolvedValue({ contactId: "contact-1" });
  mockPushLogCreate.mockResolvedValue({ id: "log-1" });
  mockBranchFindUnique.mockResolvedValue({ zohoLocationId: "loc-1" });
});

describe("pushSaleReceiptToZoho", () => {
  it("resolves the mapped zohoItemId, resolves a customer, and posts a sales receipt", async () => {
    mockZohoPost.mockResolvedValue({ sales_receipt: { sales_receipt_id: "SR-1" } });

    const result = await pushSaleReceiptToZoho(baseArgs);

    expect(result.salesReceiptId).toBe("SR-1");
    expect(mockResolveZohoCustomer).toHaveBeenCalledWith("org-1", {
      email: "customer@example.com",
      name: "Jane Doe",
    });

    const [orgId, path, body] = mockZohoPost.mock.calls[0];
    expect(orgId).toBe("org-1");
    expect(path).toBe("/salesreceipts");
    expect(body.customer_id).toBe("contact-1");
    expect(body.payment_mode).toBe("Mpesa(Daraja)");
    expect(body.reference_number).toBe("FO-0001");
    expect(body.location_id).toBeUndefined();
    expect(body.line_items[0].item_id).toBe("ZI-001");
    expect(body.line_items[0].location_id).toBe("loc-1");

    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", zohoRecordId: "SR-1", kind: "SALES_RECEIPT" }) }),
    );
  });

  it("sends no item_id when a product has no mapping for this org", async () => {
    mockMappingFindMany.mockResolvedValue([]);
    mockZohoPost.mockResolvedValue({ sales_receipt: {} });

    await pushSaleReceiptToZoho(baseArgs);

    const body = mockZohoPost.mock.calls[0][2];
    expect(body.line_items[0].item_id).toBeUndefined();
  });

  it("logs FAILED and re-throws when the Zoho call fails", async () => {
    mockZohoPost.mockRejectedValue(new Error("Zoho down"));

    await expect(pushSaleReceiptToZoho(baseArgs)).rejects.toThrow("Zoho down");
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", kind: "SALES_RECEIPT" }) }),
    );
  });

  it("logs FAILED and re-throws when customer resolution fails", async () => {
    mockResolveZohoCustomer.mockRejectedValue(new Error("Contact lookup failed"));

    await expect(pushSaleReceiptToZoho(baseArgs)).rejects.toThrow("Contact lookup failed");
    expect(mockPushLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});
