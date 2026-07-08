import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { db } from "@/lib/db";

const STATUS_MAP: Record<string, "SENT" | "DELIVERED" | "BOUNCED" | "FAILED"> = {
  queued: "SENT",
  sent: "SENT",
  delivered: "DELIVERED",
  undelivered: "BOUNCED",
  failed: "FAILED",
};

/**
 * POST /api/webhooks/twilio/status — Twilio's statusCallback target for
 * campaign SMS sends (see TWILIO_STATUS_CALLBACK in the send-campaign
 * worker). Twilio posts application/x-www-form-urlencoded, signed via
 * X-Twilio-Signature over the exact callback URL + form fields.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-twilio-signature");
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/twilio/status`;
  const isValid =
    !!signature &&
    twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, signature, url, params);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const messageSid = params.MessageSid;
  const status = STATUS_MAP[params.MessageStatus ?? ""];
  if (!messageSid || !status) {
    return NextResponse.json({ ok: true });
  }

  await db.campaignRecipient.updateMany({
    where: { providerMessageId: messageSid },
    data: {
      status,
      deliveredAt: status === "DELIVERED" ? new Date() : undefined,
      failedAt: status === "BOUNCED" || status === "FAILED" ? new Date() : undefined,
      errorMessage: params.ErrorMessage || undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
