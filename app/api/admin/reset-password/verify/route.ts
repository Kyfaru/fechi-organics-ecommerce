import { NextRequest, NextResponse } from "next/server";
import { verifyResetToken } from "@/lib/password-reset";

/**
 * GET /api/admin/reset-password/verify?token=...
 *
 * Read-only pre-check for the staff-invite/admin-action reset link
 * (app/admin/reset-password/page.tsx). Lets the page greet the recipient by
 * name and distinguish an expired link from an invalid one before rendering
 * the password form — does not consume the token.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, error: { code: "INVALID", message: "This reset link is invalid." } }, { status: 400 });
  }

  const result = await verifyResetToken(token);
  if (!result.ok) {
    const status = result.reason === "expired" ? 410 : 400;
    const message =
      result.reason === "expired" ? "This reset link has expired." : "This reset link is invalid.";
    return NextResponse.json({ ok: false, error: { code: result.reason.toUpperCase(), message } }, { status });
  }

  return NextResponse.json({ ok: true, name: result.name });
}
