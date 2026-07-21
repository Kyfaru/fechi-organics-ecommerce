import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** GET /api/admin/campaigns */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { campaigns: ["view"] });
  if (denied) return denied;

  try {
    const campaigns = await db.campaign.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Stats: sent this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sentThisMonth = campaigns.filter(
      (c) => c.status === "SENT" && c.sentAt && c.sentAt >= monthStart
    ).length;

    return ok({
      campaigns,
      stats: {
        total: campaigns.length,
        sentThisMonth,
        drafts: campaigns.filter((c) => c.status === "DRAFT").length,
      },
    });
  } catch (e) {
    console.error("[campaigns/GET]", e);
    return Err.internal(e);
  }
}

/** POST /api/admin/campaigns — create campaign */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { campaigns: ["create"] });
  if (denied) return denied;

  let body: {
    name: string;
    type: "EMAIL" | "SMS" | "PUSH" | "WHATSAPP" | "ALL";
    audienceType?: string;
    subject?: string;
    heading?: string;
    previewText?: string;
    content?: string;
    audienceCustomerIds?: string[];
    status?: "DRAFT" | "SCHEDULED";
    scheduledAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.name?.trim()) return Err.validation("Campaign name is required");
  if (!["EMAIL", "SMS", "PUSH", "WHATSAPP", "ALL"].includes(body.type)) return Err.validation("Invalid campaign type");

  try {
    const campaign = await db.campaign.create({
      data: {
        name: body.name.trim(),
        type: body.type,
        audienceType: body.audienceType ?? "ALL",
        subject: body.subject ?? null,
        heading: body.heading ?? null,
        previewText: body.previewText ?? null,
        content: body.content ?? null,
        audienceCustomerIds: body.audienceCustomerIds ?? [],
        status: body.status ?? "DRAFT",
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      },
    });
    console.info(`[campaigns/POST] Created campaign: ${campaign.id} — ${campaign.name}`);
    return created(campaign);
  } catch (e) {
    console.error("[campaigns/POST]", e);
    return Err.internal(e);
  }
}
