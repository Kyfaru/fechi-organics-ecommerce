/**
 * Unit tests for POST /api/admin/orders/bulk-delete — permanent deletion of
 * several orders at once, gated by (1) super-admin only and (2) the acting
 * admin's own password (accountability, standing in for the single-order
 * flow's "type the order number back" confirmation).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// connection() asserts it's running inside a real Next.js request scope,
// which plain vitest never provides (see project memory: "Stale Test
// Harness" — the same gap affects every route handler that calls
// connection()/headers() directly). Stub just this one export so the route
// under test is actually exercisable; everything else from next/server stays
// real (NextRequest is constructed below).
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockLoadCallerContext = vi.fn();
vi.mock("@/lib/require-permission", () => ({
  loadCallerContext: () => mockLoadCallerContext(),
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

const mockAccountFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { account: { findFirst: (...args: unknown[]) => mockAccountFindFirst(...args) } },
}));

const mockVerify = vi.fn();
vi.mock("oslo/password", () => ({
  Argon2id: function Argon2id() {
    return { verify: (...args: unknown[]) => mockVerify(...args) };
  },
}));

const mockDeleteOrder = vi.fn();
vi.mock("@/lib/orders/delete-order", () => ({
  deleteOrder: (...args: unknown[]) => mockDeleteOrder(...args),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/admin-activity", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { POST } from "@/app/api/admin/orders/bulk-delete/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/orders/bulk-delete", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const SUPER_ADMIN_CTX = { id: "admin-1", role: "super_admin", isSuperAdmin: true, branchId: null, deny: new Set<string>(), mutedNotificationTypes: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadCallerContext.mockResolvedValue(SUPER_ADMIN_CTX);
  mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
  mockAccountFindFirst.mockResolvedValue({ password: "hashed" });
  mockVerify.mockResolvedValue(true);
  mockDeleteOrder.mockResolvedValue({ orderNumber: "#FO-1", invoicePdfKey: null });
});

describe("POST /api/admin/orders/bulk-delete", () => {
  it("rejects a non-super-admin", async () => {
    mockLoadCallerContext.mockResolvedValue({ id: "admin-2", role: "manager", isSuperAdmin: false, branchId: null, deny: new Set(), mutedNotificationTypes: [] });

    const res = await POST(makeRequest({ items: [{ id: "o1", kind: "order" }], reason: "test", password: "x" }));
    expect(res.status).toBe(403);
    expect(mockDeleteOrder).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password without deleting anything", async () => {
    mockVerify.mockResolvedValue(false);

    const res = await POST(makeRequest({ items: [{ id: "o1", kind: "order" }], reason: "test", password: "wrong" }));
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(mockDeleteOrder).not.toHaveBeenCalled();
  });

  it("rejects a request with no reason", async () => {
    const res = await POST(makeRequest({ items: [{ id: "o1", kind: "order" }], reason: "  ", password: "x" }));
    expect(res.status).not.toBe(200);
    expect(mockDeleteOrder).not.toHaveBeenCalled();
  });

  it("deletes every item with the correct password and logs one bulk activity entry", async () => {
    const res = await POST(makeRequest({
      items: [{ id: "o1", kind: "order" }, { id: "o2", kind: "instore" }],
      reason: "Clearing test orders",
      password: "correct",
    }));
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(mockDeleteOrder).toHaveBeenCalledTimes(2);
    expect(mockDeleteOrder).toHaveBeenCalledWith({ id: "o1", kind: "order", reason: "Clearing test orders", actorAdminProfileId: "admin-1" });
    expect(mockDeleteOrder).toHaveBeenCalledWith({ id: "o2", kind: "instore", reason: "Clearing test orders", actorAdminProfileId: "admin-1" });
    expect(json.data.deleted).toHaveLength(2);
    expect(json.data.failed).toHaveLength(0);
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    expect(mockLogActivity.mock.calls[0][6]).toBe("CRITICAL");
  });

  it("keeps going after one item fails and reports it separately", async () => {
    mockDeleteOrder
      .mockResolvedValueOnce({ orderNumber: "#FO-1", invoicePdfKey: null })
      .mockRejectedValueOnce(new Error("Order not found"));

    const res = await POST(makeRequest({
      items: [{ id: "o1", kind: "order" }, { id: "missing", kind: "order" }],
      reason: "test",
      password: "correct",
    }));
    const json = await res.json();

    expect(json.data.deleted).toHaveLength(1);
    expect(json.data.failed).toEqual([{ id: "missing", error: "Order not found" }]);
  });
});
