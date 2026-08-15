import { describe, it, expect } from "vitest";
import { buildInstoreSmsMessage } from "@/lib/invoice/build-instore-sms";

describe("buildInstoreSmsMessage", () => {
  it("greets by name when customerName is set", () => {
    const msg = buildInstoreSmsMessage({
      invoiceNumber: "INV-OBI260815005044",
      customerName: "John",
      url: "https://cdn.example.com/invoices/foo.pdf",
    });

    expect(msg).toBe("Hello John, invoice INV-OBI260815005044 ready: https://cdn.example.com/invoices/foo.pdf");
  });

  it("falls back to a generic greeting when customerName is null", () => {
    const msg = buildInstoreSmsMessage({
      invoiceNumber: "INV-OBI260815005044",
      customerName: null,
      url: "https://cdn.example.com/invoices/foo.pdf",
    });

    expect(msg).toBe("Hello, invoice INV-OBI260815005044 ready: https://cdn.example.com/invoices/foo.pdf");
  });
});
