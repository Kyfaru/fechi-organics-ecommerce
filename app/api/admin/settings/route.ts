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
import { requirePermission } from "@/lib/require-permission";

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
    const updated = await db.systemConfig.upsert({
      where: { key: key.trim() },
      create: { key: key.trim(), value: value as never },
      update: { value: value as never },
    });

    return ok({ setting: updated });
  } catch (err) {
    console.error("[PATCH /api/admin/settings]", err);
    return Err.internal(err);
  }
}
