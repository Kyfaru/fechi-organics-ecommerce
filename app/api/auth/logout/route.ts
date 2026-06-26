import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getRedis } from "@/lib/redis";
import { sessionChannel } from "@/lib/session-channel";

export async function POST(): Promise<NextResponse> {
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    // Publish invalidation before signOut so the SSE stream catches it
    // while the session is still valid on the server.
    try {
      await getRedis().set(
        sessionChannel(session.session.id),
        JSON.stringify({ type: "session_invalidated", reason: "logout", timestamp: Date.now() }),
        { ex: 60 }
      );
    } catch (e) {
      console.error("[logout] Redis set failed:", e);
    }

    await auth.api.signOut({ headers: await headers() });
  }

  const response = NextResponse.json({ success: true });

  // Clear the better-auth session cookie immediately
  response.cookies.set("better-auth.session_token", "", {
    maxAge: 0,
    path: "/",
  });

  return response;
}
