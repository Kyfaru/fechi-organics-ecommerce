/**
 * GET  /api/admin/settings — return all systemConfig entries as a flat key→value map
 * PATCH /api/admin/settings — upsert a single { key, value } pair
 *
 * systemConfig schema: id, key (unique String), value (Json), updatedAt
 * We store values as JSON — strings are stored as JSON strings.
 */

import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext } from "@/lib/require-permission";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { approvalExecutors } from "@/lib/approval-executors";
import { logActivity } from "@/lib/admin-activity";

// Settings keys sensitive enough to require admin approval before a
// non-admin role's change takes effect — currently just the password
// policy (Security tab); extend this list as more settings gain a real
// save path (e.g. once the API & Integrations tab's TODOs are wired up).
const SENSITIVE_SETTING_KEYS = new Set(["pw_min_length", "pw_require_special"]);

export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { settings: ["view"] });
  if (denied) return denied;

  try {
    const rows = await db.systemConfig.findMany({ orderBy: { key: "asc" } });

    // Convert rows to a flat Record<string, unknown> for easy client consumption
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return ok({ settings });
  } catch (err) {
    console.error("[GET /api/admin/settings]", err);
    return Err.internal(err);
  }
}

export async function PATCH(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { settings: ["update"] });
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }

  const { key, value } = body as { key?: string; value?: unknown };

  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return Err.validation("Field 'key' is required.");
  }
  if (value === undefined) {
    return Err.validation("Field 'value' is required.");
  }

  try {
    const trimmedKey = key.trim();

    if (SENSITIVE_SETTING_KEYS.has(trimmedKey)) {
      const ctx = await loadCallerContext();
      if (ctx.denied) return Err.forbidden();
      const outcome = await requireApprovalOrProceed(ctx, "settings", "update", { key: trimmedKey, value });
      if (!outcome.proceed) return Approval.queued(outcome.requestId);
      const updated = await approvalExecutors["settings:update"]({ key: trimmedKey, value }, null) as
        Awaited<ReturnType<typeof db.systemConfig.upsert>>;
      logActivity(ctx.id, `Updated setting "${trimmedKey}"`, "setting", trimmedKey, req);
      return ok({ setting: updated });
    }

    const updated = await db.systemConfig.upsert({
      where: { key: trimmedKey },
      create: { key: trimmedKey, value: value as never },
      update: { value: value as never },
    });

    return ok({ setting: updated });
  } catch (err) {
    console.error("[PATCH /api/admin/settings]", err);
    return Err.internal(err);
  }
}
