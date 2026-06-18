/**
 * GET  /api/admin/settings — return all systemConfig entries as a flat key→value map
 * PATCH /api/admin/settings — upsert a single { key, value } pair
 *
 * systemConfig schema: id, key (unique String), value (Json), updatedAt
 * We store values as JSON — strings are stored as JSON strings.
 */

import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const caller = await db.user.findUnique({ where: { id: session.user.id } });
  if (caller?.role !== "admin") return Err.forbidden();

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
    return Err.internal();
  }
}

export async function PATCH(req: Request) {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const caller = await db.user.findUnique({ where: { id: session.user.id } });
  if (caller?.role !== "admin") return Err.forbidden();

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
    return Err.internal();
  }
}
