import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasSmsConfig } from "@/lib/sms";
import { reportError } from "@/lib/observability";

/**
 * POST /api/admin/forgot-password/channels
 *
 * Read-only pre-check for the forgot-password wizard's channel step. Always
 * 200 — never reveals whether the account exists, only whether an SMS
 * channel would be usable if it does.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body as { email?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json({ smsAvailable: false });
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { role: true, phone: true },
    });

    const smsAvailable = !!(user && user.role === "admin" && user.phone && hasSmsConfig());

    return NextResponse.json({ smsAvailable });
  } catch (err) {
    console.error("[admin/forgot-password/channels]", err);
    reportError(err, { route: "POST /api/admin/forgot-password/channels", tags: { flow: "admin-forgot-password" } });
    return NextResponse.json({ smsAvailable: false });
  }
}
