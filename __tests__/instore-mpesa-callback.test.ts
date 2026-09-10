/**
 * Unit tests for app/api/payments/mpesa/instore-callback/route.ts — verifies
 * it correctly processes BOTH Daraja-shaped and KCB Buni-shaped STK
 * callbacks, since in-store initiate uses the same callback URL regardless
 * of which gateway a branch is configured for.
 *
 * Mocks: @/lib/db, @/lib/payments/instore-post-payment (same pattern as
 * __tests__/instore-payments.test.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockMarkSuccess = vi.fn().mockResolvedValue(undefined);
const mockMarkFailed = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/payments/instore-post-payment", () => ({
  markInStorePaymentSuccess: (...args: unknown[]) => mockMarkSuccess(...args),
  markInStorePaymentFailed: (...args: unknown[]) => mockMarkFailed(...args),
}));

const mockInStoreTransactionFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    inStoreTransaction: {
      findUnique: (...args: unknown[]) => mockInStoreTransactionFindUnique(...args),
    },
  },
}));

import { POST } from "@/app/api/payments/mpesa/instore-callback/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/payments/mpesa/instore-callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PENDING_TX = (gateway: "DARAJA" | "KCB_BUNI") => ({
  id: "instore-tx-1",
  inStoreOrderId: "instore-order-1",
  status: "PENDING",
  inStoreOrder: { branch: { mpesaGateway: gateway } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/payments/mpesa/instore-callback — Daraja-shaped payload", () => {
  const DARAJA_SUCCESS = {
    Body: {
      stkCallback: {
        CheckoutRequestID: "ws_CO_DARAJA_001",
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 1500 },
            { Name: "MpesaReceiptNumber", Value: "QAB1DARAJA" },
            { Name: "TransactionDate", Value: 20260710120000 },
            { Name: "PhoneNumber", Value: 254712345678 },
          ],
        },
      },
    },
  };

  it("marks the transaction paid and extracts the receipt number", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue(PENDING_TX("DARAJA"));

    const res = await POST(makeRequest(DARAJA_SUCCESS));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe(0);
    expect(mockMarkSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "instore-tx-1",
        inStoreOrderId: "instore-order-1",
        transactionData: expect.objectContaining({
          status: "SUCCESS",
          mpesaReceiptNumber: "QAB1DARAJA",
        }),
      }),
    );
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("marks the transaction failed on a non-zero ResultCode", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue(PENDING_TX("DARAJA"));

    const failed = {
      Body: {
        stkCallback: {
          CheckoutRequestID: "ws_CO_DARAJA_002",
          ResultCode: 1032,
          ResultDesc: "Request cancelled by user.",
        },
      },
    };

    const res = await POST(makeRequest(failed));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe(0); // always acks 0 to the provider
    expect(mockMarkFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "instore-tx-1",
        inStoreOrderId: "instore-order-1",
        reason: "1032:Request cancelled by user.",
      }),
    );
    expect(mockMarkSuccess).not.toHaveBeenCalled();
  });
});

describe("POST /api/payments/mpesa/instore-callback — KCB Buni-shaped payload", () => {
  const KCB_SUCCESS = {
    Body: {
      stkCallback: {
        CheckoutRequestID: "ws_CO_KCB_001",
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 1500 },
            { Name: "MpesaReceiptNumber", Value: "QAB1KCB" },
          ],
        },
      },
    },
  };

  it("marks the transaction paid and extracts the receipt number for a KCB_BUNI branch", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue(PENDING_TX("KCB_BUNI"));

    const res = await POST(makeRequest(KCB_SUCCESS));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe(0);
    expect(mockMarkSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "instore-tx-1",
        inStoreOrderId: "instore-order-1",
        transactionData: expect.objectContaining({
          status: "SUCCESS",
          mpesaReceiptNumber: "QAB1KCB",
        }),
      }),
    );
  });

  it("marks the transaction failed on a non-zero ResultCode for a KCB_BUNI branch", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue(PENDING_TX("KCB_BUNI"));

    const failed = {
      Body: {
        stkCallback: {
          CheckoutRequestID: "ws_CO_KCB_002",
          ResultCode: 2001,
          ResultDesc: "Wrong PIN entered.",
        },
      },
    };

    const res = await POST(makeRequest(failed));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe(0);
    expect(mockMarkFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "2001:Wrong PIN entered." }),
    );
  });
});

describe("POST /api/payments/mpesa/instore-callback — shared edge cases", () => {
  it("acks 200 without processing when CheckoutRequestID is unknown", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({
      Body: { stkCallback: { CheckoutRequestID: "ws_CO_UNKNOWN", ResultCode: 0 } },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe(0);
    expect(mockMarkSuccess).not.toHaveBeenCalled();
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("acks 200 without reprocessing when the transaction is no longer PENDING", async () => {
    mockInStoreTransactionFindUnique.mockResolvedValue({
      id: "instore-tx-1",
      inStoreOrderId: "instore-order-1",
      status: "SUCCESS",
      inStoreOrder: { branch: { mpesaGateway: "DARAJA" } },
    });

    const res = await POST(makeRequest({
      Body: { stkCallback: { CheckoutRequestID: "ws_CO_DARAJA_001", ResultCode: 0 } },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe(0);
    expect(mockMarkSuccess).not.toHaveBeenCalled();
  });

  it("acks 200 on a payload matching neither shape (no CheckoutRequestID)", async () => {
    const res = await POST(makeRequest({ some: "unexpected shape" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe(0);
    expect(mockInStoreTransactionFindUnique).not.toHaveBeenCalled();
  });

  it("acks 200 on malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/payments/mpesa/instore-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ResultCode).toBe(0);
  });
});
