import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { logActivity } from "@/lib/admin-activity";
import { promotionCreateSchema } from "@/lib/promotions/schema";
import { reportError } from "@/lib/observability";

/**
 * GET /api/admin/promotions?scope=store|customer
 *
 * `store`    — coupons staff created (ownerUserId is null)
 * `customer` — customers' own referral codes, created automatically
 * omitted    — everything, as before
 *
 * Customer rows are enriched with the owner's name and email so the tab can
 * show who a code belongs to without a second round trip.
 */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { promotions: ["view"] });
  if (denied) return denied;

  try {
    const scope = new URL(req.url).searchParams.get("scope");
    const where =
      scope === "store"
        ? { ownerUserId: null }
        : scope === "customer"
          ? { ownerUserId: { not: null } }
          : {};

    const promotions = await db.promotion.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // `promotion` lives in the `admin` Postgres schema and `user` in `public`,
    // with no relation between them — so this is a second query joined in code,
    // not an include.
    const ownerIds = [...new Set(promotions.map((p) => p.ownerUserId).filter(Boolean))] as string[];
    const owners = ownerIds.length
      ? await db.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, name: true, email: true, image: true },
        })
      : [];
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    return ok(
      promotions.map((p) => ({
        ...p,
        owner: p.ownerUserId ? (ownerById.get(p.ownerUserId) ?? null) : null,
      })),
    );
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  // Replaces three hand-rolled `if` checks. The points ceiling in particular
  // has to be enforced here — the client can be bypassed.
  const parsed = promotionCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return Err.validation(parsed.error.issues[0]?.message ?? "Invalid promotion");
  }
  const body = parsed.data;

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
