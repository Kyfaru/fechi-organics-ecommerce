/**
 * Unit tests for app/api/admin/blog/[id]/publish/route.ts
 * Mocks: lib/auth.ts, lib/db.ts, lib/qstash.ts, next/headers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock next/headers — the route calls headers() outside a real request scope
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
// Mock lib/qstash.ts
// ---------------------------------------------------------------------------
const mockPublishQstashJSON = vi.fn();
vi.mock("@/lib/qstash", () => ({
  publishQstashJSON: (...args: unknown[]) => mockPublishQstashJSON(...args),
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockUserFindUnique = vi.fn();
const mockBlogPostFindUnique = vi.fn();
const mockBlogPostUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    blogPost: {
      findUnique: (...args: unknown[]) => mockBlogPostFindUnique(...args),
      update: (...args: unknown[]) => mockBlogPostUpdate(...args),
    },
  },
}));

import { POST } from "@/app/api/admin/blog/[id]/publish/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOCK_SESSION = { user: { id: "admin-1" } };
const MOCK_ADMIN = { id: "admin-1", role: "admin" };
const MOCK_POST = { id: "post-1", title: "Test Post", status: "DRAFT" };

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/blog/post-1/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function callPost(body?: unknown) {
  return POST(makeRequest(body), { params: Promise.resolve({ id: "post-1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(MOCK_SESSION);
  mockUserFindUnique.mockResolvedValue(MOCK_ADMIN);
  mockBlogPostFindUnique.mockResolvedValue(MOCK_POST);
  mockBlogPostUpdate.mockResolvedValue({ ...MOCK_POST, status: "SCHEDULED" });
  mockPublishQstashJSON.mockResolvedValue({ messageId: "msg-1" });
});

describe("POST /api/admin/blog/[id]/publish", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await callPost({ mode: "schedule", scheduledAt: futureIso() });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("AUTH_REQUIRED");
  });

  it("returns 403 when authenticated but not an admin", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "user-1", role: "customer" });

    const res = await callPost({ mode: "schedule", scheduledAt: futureIso() });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when the post doesn't exist", async () => {
    mockBlogPostFindUnique.mockResolvedValue(null);

    const res = await callPost({ mode: "schedule", scheduledAt: futureIso() });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(mockPublishQstashJSON).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION when scheduledAt is missing", async () => {
    const res = await callPost({ mode: "schedule" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
    expect(mockPublishQstashJSON).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION when scheduledAt is not a valid date", async () => {
    const res = await callPost({ mode: "schedule", scheduledAt: "not-a-date" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
  });

  it("returns 400 VALIDATION when scheduledAt is in the past", async () => {
    const res = await callPost({ mode: "schedule", scheduledAt: "2020-01-01T00:00:00.000Z" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION");
    expect(mockPublishQstashJSON).not.toHaveBeenCalled();
    expect(mockBlogPostUpdate).not.toHaveBeenCalled();
  });

  it("enqueues to Qstash with the right notBefore and updates status/publishedAt", async () => {
    const scheduledAt = futureIso();
    const res = await callPost({ mode: "schedule", scheduledAt });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.queued).toBe(true);

    expect(mockPublishQstashJSON).toHaveBeenCalledWith(
      "/api/admin/workers/publish-blog-post",
      { postId: "post-1" },
      { notBefore: Math.floor(new Date(scheduledAt).getTime() / 1000) }
    );

    expect(mockBlogPostUpdate).toHaveBeenCalledWith({
      where: { id: "post-1" },
      data: { status: "SCHEDULED", publishedAt: new Date(scheduledAt) },
    });
  });
});

function futureIso(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
}
