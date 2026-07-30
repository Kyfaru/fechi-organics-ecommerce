/**
 * Unit tests for lib/zoho/resolve-customer.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockZohoGet = vi.fn();
const mockZohoPost = vi.fn();
vi.mock("@/lib/zoho", () => ({
  zohoGet: (...args: unknown[]) => mockZohoGet(...args),
  zohoPost: (...args: unknown[]) => mockZohoPost(...args),
}));

import { resolveZohoCustomer } from "@/lib/zoho/resolve-customer";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveZohoCustomer", () => {
  it("reuses an existing contact when the email matches (case-insensitive)", async () => {
    mockZohoGet.mockResolvedValue({
      contacts: [{ contact_id: "contact-1", email: "Jane@Example.com" }],
    });

    const result = await resolveZohoCustomer("org-1", { email: "jane@example.com", name: "Jane Doe" });

    expect(result.contactId).toBe("contact-1");
    expect(mockZohoPost).not.toHaveBeenCalled();
  });

  it("creates a new contact when no email match is found", async () => {
    mockZohoGet.mockResolvedValue({ contacts: [] });
    mockZohoPost.mockResolvedValue({ contact: { contact_id: "contact-new" } });

    const result = await resolveZohoCustomer("org-1", { email: "new@example.com", name: "New Customer" });

    expect(result.contactId).toBe("contact-new");
    expect(mockZohoPost).toHaveBeenCalledWith("org-1", "/contacts", {
      contact_name: "New Customer",
      email: "new@example.com",
    });
  });

  it("creates a contact with a fallback name when no email or name is given", async () => {
    mockZohoPost.mockResolvedValue({ contact: { contact_id: "contact-fallback" } });

    const result = await resolveZohoCustomer("org-1", {});

    expect(result.contactId).toBe("contact-fallback");
    expect(mockZohoGet).not.toHaveBeenCalled();
    expect(mockZohoPost).toHaveBeenCalledWith("org-1", "/contacts", {
      contact_name: "Website Customer",
    });
  });

  it("ignores a false-positive from an unfiltered/broadly-filtered search result", async () => {
    mockZohoGet.mockResolvedValue({
      contacts: [{ contact_id: "unrelated", email: "someone-else@example.com" }],
    });
    mockZohoPost.mockResolvedValue({ contact: { contact_id: "contact-new" } });

    const result = await resolveZohoCustomer("org-1", { email: "jane@example.com", name: "Jane Doe" });

    expect(result.contactId).toBe("contact-new");
    expect(mockZohoPost).toHaveBeenCalledOnce();
  });

  it("throws when contact creation returns no contact_id", async () => {
    mockZohoPost.mockResolvedValue({ contact: {} });

    await expect(resolveZohoCustomer("org-1", { email: "x@example.com" })).rejects.toThrow(
      "no contact_id",
    );
  });
});
