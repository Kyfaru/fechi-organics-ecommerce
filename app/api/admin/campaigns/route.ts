import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { connection } from "next/server";
import { NextRequest } from "next/server";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { logActivity } from "@/lib/admin-activity";

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
    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const outcome = await requireApprovalOrProceed(ctx, "campaigns", "create", body);
    if (!outcome.proceed) return Approval.queued(outcome.requestId);

    const campaign = await approvalExecutors["campaigns:create"](body, null) as
      Awaited<ReturnType<typeof db.campaign.create>>;

    console.info(`[campaigns/POST] Created campaign: ${campaign.id} — ${campaign.name}`);
    logActivity(ctx.id, `Created campaign "${campaign.name}"`, "campaign", campaign.id, req);
    return created(campaign);
  } catch (e) {
    console.error("[campaigns/POST]", e);
    return Err.internal(e);
  }
}
