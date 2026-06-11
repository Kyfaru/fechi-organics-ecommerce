import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

export async function POST(): Promise<NextResponse> {
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
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
