// Runs at the admin-scheduled datetime (Qstash notBefore), enqueued by
// app/api/admin/blog/[id]/publish, to flip a SCHEDULED blog post live.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyQstashRequest } from "@/lib/qstash";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { postId } = JSON.parse(rawBody) as { postId: string };

  const post = await db.blogPost.findUnique({
    where: { id: postId },
    select: { status: true },
  });
  // Already published, reverted to draft, or archived before the scheduled
  // time arrived — idempotency guard so a Qstash retry never clobbers a
  // status an admin already changed by hand.
  if (!post || post.status !== "SCHEDULED") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await db.blogPost.update({
    where: { id: postId },
    data: { status: "PUBLISHED" },
  });

  console.info(`[publish-blog-post] Post ${postId} published`);
  return NextResponse.json({ ok: true });
}
