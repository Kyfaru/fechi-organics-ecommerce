import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/track/click?c=<campaignId>&u=<userId>&url=<encoded target>
 *
 * Every link inside a sent campaign's content is rewritten (see
 * lib/campaign-tracking.ts) to point here first, so a click can be logged
 * against the recipient before redirecting on to the real destination.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("c");
  const userId = searchParams.get("u");
  const target = searchParams.get("url");

  if (!target || !isSafeRedirectTarget(target)) {
    return NextResponse.json({ error: "Invalid redirect target" }, { status: 400 });
  }

  if (campaignId && userId) {
    await db.campaignRecipient
      .updateMany({
        where: { campaignId, userId, status: { notIn: ["CLICKED"] } },
        data: { status: "CLICKED", clickedAt: new Date() },
      })
      .catch((err) => console.error("[track-click] Failed to record click:", err));
  }

  return NextResponse.redirect(target, { status: 302 });
}

function isSafeRedirectTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
