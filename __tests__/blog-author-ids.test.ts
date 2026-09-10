/**
 * Unit tests for authorIds handling in:
 *   - app/api/admin/blog/route.ts (POST)
 *   - app/api/admin/blog/[id]/route.ts (PATCH)
 *
 * Mocks: lib/auth.ts, lib/db.ts, next/headers, next/server's connection()
 * (same pattern as __tests__/blog-schedule-publish.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock next/headers — the routes call headers() outside a real request scope
// ---------------------------------------------------------------------------
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

// ---------------------------------------------------------------------------
// Mock next/server's connection() — outside a real Next request lifecycle
// (as in this Vitest environment) it throws "called outside a request scope"
// on this Next version. Pre-existing repo-wide issue (__tests__/orders.test.ts
// hits the same error unmodified), not something introduced by this route —
// stubbed here only, real NextRequest/NextResponse are left untouched.
// ---------------------------------------------------------------------------
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, connection: async () => {} };
});

// ---------------------------------------------------------------------------
// Mock lib/auth.ts
// ---------------------------------------------------------------------------
const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockUserFindUnique = vi.fn();
const mockBlogPostCreate = vi.fn();
const mockBlogPostUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    blogPost: {
      create: (...args: unknown[]) => mockBlogPostCreate(...args),
      update: (...args: unknown[]) => mockBlogPostUpdate(...args),
    },
  },
}));

import { POST } from "@/app/api/admin/blog/route";
import { PATCH } from "@/app/api/admin/blog/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOCK_SESSION = { user: { id: "admin-1" } };
const MOCK_ADMIN = { id: "admin-1", role: "admin" };

function makeRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function callPost(body?: unknown) {
  return POST(makeRequest("http://localhost/api/admin/blog", "POST", body));
}

function callPatch(id: string, body?: unknown) {
  return PATCH(makeRequest(`http://localhost/api/admin/blog/${id}`, "PATCH", body), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(MOCK_SESSION);
  mockUserFindUnique.mockResolvedValue(MOCK_ADMIN);
  mockBlogPostCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "post-1",
    ...data,
  }));
  mockBlogPostUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "post-1",
    ...data,
  }));
});

describe("POST /api/admin/blog — authorIds", () => {
  it("persists authorIds and sets authorId to authorIds[0] when non-empty", async () => {
    const res = await callPost({ title: "Test Post", authorIds: ["admin-2", "admin-3"] });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);

    const { data } = mockBlogPostCreate.mock.calls[0][0];
    expect(data.authorIds).toEqual(["admin-2", "admin-3"]);
    expect(data.authorId).toBe("admin-2");
  });

  it("falls back authorId to the session admin when authorIds is an empty array", async () => {
    const res = await callPost({ title: "Test Post", authorIds: [] });
    expect(res.status).toBe(201);

    const { data } = mockBlogPostCreate.mock.calls[0][0];
    expect(data.authorIds).toEqual([]);
    expect(data.authorId).toBe("admin-1"); // session.user.id
  });

  it("falls back authorId to the session admin when authorIds is missing entirely (existing-caller behavior preserved)", async () => {
    const res = await callPost({ title: "Test Post" });
    expect(res.status).toBe(201);

    const { data } = mockBlogPostCreate.mock.calls[0][0];
    expect(data.authorIds).toEqual([]);
    expect(data.authorId).toBe("admin-1"); // session.user.id
  });
});

describe("PATCH /api/admin/blog/[id] — authorIds", () => {
  it("persists authorIds and sets authorId to authorIds[0] when non-empty", async () => {
    const res = await callPatch("post-1", { authorIds: ["admin-2"] });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const { data } = mockBlogPostUpdate.mock.calls[0][0];
    expect(data.authorIds).toEqual(["admin-2"]);
    expect(data.authorId).toBe("admin-2");
  });

  it("falls back authorId to the session admin when authorIds is provided as an empty array", async () => {
    const res = await callPatch("post-1", { authorIds: [] });
    expect(res.status).toBe(200);

    const { data } = mockBlogPostUpdate.mock.calls[0][0];
    expect(data.authorIds).toEqual([]);
    expect(data.authorId).toBe("admin-1"); // session.user.id
  });

  it("does not touch authorId or authorIds when authorIds is absent from the payload", async () => {
    const res = await callPatch("post-1", { title: "New Title" });
    expect(res.status).toBe(200);

    const { data } = mockBlogPostUpdate.mock.calls[0][0];
    expect(data).not.toHaveProperty("authorIds");
    expect(data).not.toHaveProperty("authorId");
    expect(data.title).toBe("New Title");
  });
});
