import { NextRequest, NextResponse } from "next/server";
import { qstashReceiver } from "@/lib/qstash";
import { db } from "@/lib/db";
import { runCampaignSend, markCampaignFailed } from "@/lib/campaigns/send-campaign";
import { reportError } from "@/lib/observability";
import { trackServerEvent } from "@/lib/observability-server";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const signature = req.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const isValid = await qstashReceiver.verify({ signature, body: rawBody });
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { campaignId } = JSON.parse(rawBody) as { campaignId: string };

  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    const result = await runCampaignSend(campaignId, campaign);
    trackServerEvent("system", "worker_send_campaign_completed", { campaignId });
    return NextResponse.json(result);
  } catch (err) {
    await markCampaignFailed(campaignId, err);
    reportError(err, { route: "/api/admin/workers/send-campaign", tags: { campaignId } });
    trackServerEvent("system", "worker_send_campaign_failed", { campaignId });
    return NextResponse.json({ error: "Campaign send failed" }, { status: 500 });
  }
}
