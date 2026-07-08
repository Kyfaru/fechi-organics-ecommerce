/**
 * Unit tests for app/api/admin/workers/publish-blog-post/route.ts
 * Mocks: lib/qstash.ts (signature verification), lib/db.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock lib/qstash.ts
// ---------------------------------------------------------------------------
const mockVerifyQstashRequest = vi.fn();
vi.mock("@/lib/qstash", () => ({
  verifyQstashRequest: (...args: unknown[]) => mockVerifyQstashRequest(...args),
}));

// ---------------------------------------------------------------------------
// Mock lib/db.ts
// ---------------------------------------------------------------------------
const mockBlogPostFindUnique = vi.fn();
const mockBlogPostUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    blogPost: {
      findUnique: (...args: unknown[]) => mockBlogPostFindUnique(...args),
      update: (...args: unknown[]) => mockBlogPostUpdate(...args),
    },
  },
}));

import { POST } from "@/app/api/admin/workers/publish-blog-post/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, signature: string | null = "valid-signature"): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== null) headers["upstash-signature"] = signature;
  return new NextRequest("http://localhost/api/admin/workers/publish-blog-post", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyQstashRequest.mockResolvedValue(true);
  mockBlogPostFindUnique.mockResolvedValue({ status: "SCHEDULED" });
  mockBlogPostUpdate.mockResolvedValue({ id: "post-1", status: "PUBLISHED" });
});

describe("POST /api/admin/workers/publish-blog-post", () => {
  it("returns 401 when the Qstash signature is invalid", async () => {
    mockVerifyQstashRequest.mockResolvedValue(false);

    const res = await POST(makeRequest({ postId: "post-1" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Invalid signature");
    expect(mockBlogPostUpdate).not.toHaveBeenCalled();
  });

  it("skips as a no-op when the post no longer exists", async () => {
    mockBlogPostFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ postId: "post-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.skipped).toBe(true);
    expect(mockBlogPostUpdate).not.toHaveBeenCalled();
  });

  it("skips as a no-op when the post is no longer SCHEDULED (idempotency guard)", async () => {
    // e.g. an admin manually published or archived it before the scheduled time fired
    mockBlogPostFindUnique.mockResolvedValue({ status: "PUBLISHED" });

    const res = await POST(makeRequest({ postId: "post-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.skipped).toBe(true);
    expect(mockBlogPostUpdate).not.toHaveBeenCalled();
  });

  it("publishes the post when it is still SCHEDULED", async () => {
    const res = await POST(makeRequest({ postId: "post-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockBlogPostUpdate).toHaveBeenCalledWith({
      where: { id: "post-1" },
      data: { status: "PUBLISHED" },
    });
  });
});
