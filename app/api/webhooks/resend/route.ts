import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

const EVENT_MAP: Record<string, "DELIVERED" | "BOUNCED" | "SPAM" | "OPENED" | "CLICKED"> = {
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.complained": "SPAM",
  "email.opened": "OPENED",
  "email.clicked": "CLICKED",
};

/**
 * POST /api/webhooks/resend — Resend signs webhooks the Svix way (a
 * `whsec_`-prefixed base64 secret, svix-id/svix-timestamp/svix-signature
 * headers). Verified here by hand with node:crypto instead of pulling in
 * the svix package for what's a dozen lines of HMAC-SHA256.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhooks/resend] RESEND_WEBHOOK_SECRET not configured — rejecting.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const rawBody = await req.text();

  if (!svixId || !svixTimestamp || !svixSignature || !verifySignature(secret, svixId, svixTimestamp, svixSignature, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as { type?: string; data?: { email_id?: string } };
  const status = EVENT_MAP[event.type ?? ""];
  const emailId = event.data?.email_id;
  if (!status || !emailId) {
    return NextResponse.json({ ok: true });
  }

  await db.campaignRecipient.updateMany({
    where: { providerMessageId: emailId },
    data: {
      status,
      deliveredAt: status === "DELIVERED" ? new Date() : undefined,
      openedAt: status === "OPENED" ? new Date() : undefined,
      clickedAt: status === "CLICKED" ? new Date() : undefined,
      failedAt: status === "BOUNCED" ? new Date() : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}

function verifySignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignatureHeader: string,
  body: string
): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  return svixSignatureHeader
    .split(" ")
    .some((part) => {
      const [, sig] = part.split(",");
      if (!sig) return false;
      const sigBuf = Buffer.from(sig);
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
    });
}
