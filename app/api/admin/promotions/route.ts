import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { logActivity } from "@/lib/admin-activity";
import { reportError } from "@/lib/observability";

/** GET /api/admin/promotions */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { promotions: ["view"] });
  if (denied) return denied;

  try {
    const promotions = await db.promotion.findMany({
      orderBy: { createdAt: "desc" },
    });
    return ok(promotions);
  } catch (e) {
    console.error("[promotions/GET]", e);
    reportError(e, { route: "GET /api/admin/promotions" });
    return Err.internal();
  }
}

/** POST /api/admin/promotions — create promotion */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { promotions: ["create"] });
  if (denied) return denied;

  let body: {
    name: string;
    type: string;
    value: number;
    code?: string;
    minOrder?: number;
    maxUses?: number;
    maxUsesPerUser?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.name?.trim()) return Err.validation("Promotion name is required");
  if (!body.type) return Err.validation("Type is required");
  if (body.value == null) return Err.validation("Value is required");

  try {
    const ctx = await loadCallerContext();
    if (ctx.denied) return Err.forbidden();

    const outcome = await requireApprovalOrProceed(ctx, "promotions", "create", body);
    if (!outcome.proceed) return Approval.queued(outcome.requestId);

    const promotion = await approvalExecutors["promotions:create"](body, null) as
      Awaited<ReturnType<typeof db.promotion.create>>;

    console.info(`[promotions/POST] Created promotion: ${promotion.id} — ${promotion.name}`);
    logActivity(ctx.id, `Created promotion "${promotion.name}"`, "promotion", promotion.id, req);
    return created(promotion);
  } catch (e) {
    console.error("[promotions/POST]", e);
    reportError(e, { route: "POST /api/admin/promotions" });
    return Err.internal();
  }
}
