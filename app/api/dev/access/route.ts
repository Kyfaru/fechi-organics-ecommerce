import { NextRequest, NextResponse } from "next/server";
import { DEV_ACCESS_COOKIE } from "@/lib/dev-access";

/**
 * POST /api/dev/access — flips the developer admin-access cookie on/off.
 * Gated purely by DEV_ACCESS_SECRET in the request body, not by any session
 * — that's the point, this exists for a developer with no admin account at
 * all. See app/dev/access/page.tsx for the toggle UI, and lib/dev-access.ts
 * / lib/require-permission.ts / proxy.ts for where the cookie is checked.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.DEV_ACCESS_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  let body: { key?: string; on?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (body.key !== secret) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, on: !!body.on });
  if (body.on) {
    res.cookies.set(DEV_ACCESS_COOKIE, secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  } else {
    res.cookies.set(DEV_ACCESS_COOKIE, "", { maxAge: 0, path: "/" });
  }
  return res;
}
