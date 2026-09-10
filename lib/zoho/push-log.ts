import { db } from "@/lib/db";
import type { ZohoPushKind, ZohoPushStatus } from "@prisma/client";

/**
 * Records one outbound push attempt to Zoho (a sale or an inventory
 * adjustment) so failures are discoverable in the admin panel instead of
 * only ever appearing in server logs. One row per attempt, written after it
 * completes — never throws, so a logging failure can't break the caller.
 */
export async function recordZohoPush(entry: {
  kind: ZohoPushKind;
  status: ZohoPushStatus;
  organizationId?: string | null;
  branchId?: string | null;
  productId?: string | null;
  referenceType?: string;
  referenceId?: string;
  zohoRecordId?: string | null;
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.zohoPushLog.create({ data: entry });
  } catch (e) {
    console.error("[zoho/push-log] Failed to record push log entry", entry, e);
  }
}
