import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { qstash } from "@/lib/qstash";
import { requireAdminPage } from "@/lib/admin-guard";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** POST /api/admin/campaigns/[id]/send
 *  Enqueues campaign to Qstash worker and sets status to SENDING.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requireAdminPage(req, 'campaigns');
  if (denied) return denied;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) return Err.notFound("Campaign");
  if (campaign.status === "SENDING" || campaign.status === "SENT") {
    return Err.validation(`Campaign is already ${campaign.status.toLowerCase()}`);
  }

  try {
    // Enqueue to Qstash worker for async processing
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/workers/send-campaign`,
      body: { campaignId: id },
    });

    const updated = await db.campaign.update({
      where: { id },
      data: { status: "SENDING", sentAt: new Date() },
    });

    console.info(`[campaigns/send] Campaign ${id} (${campaign.name}) enqueued to Qstash`);
    return ok({ queued: true, campaign: updated });
  } catch (e) {
    console.error("[campaigns/send/POST]", e);
    return Err.internal("Failed to enqueue campaign");
  }
}
