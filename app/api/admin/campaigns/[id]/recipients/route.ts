import { db } from "@/lib/db";
import { ok } from "@/lib/api";
import { NextRequest } from "next/server";
import { connection } from "next/server";
import { requireAdminPage } from "@/lib/admin-guard";

/** GET /api/admin/campaigns/[id]/recipients — per-recipient delivery status + aggregate counts. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const denied = await requireAdminPage(req, "campaigns");
  if (denied) return denied;

  const { id } = await params;

  const recipients = await db.campaignRecipient.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const userIds = [...new Set(recipients.map((r) => r.userId))];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const counts: Record<string, number> = {};
  for (const r of recipients) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return ok({
    counts,
    total: recipients.length,
    recipients: recipients.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: userMap.get(r.userId)?.name ?? "Unknown",
      email: userMap.get(r.userId)?.email ?? "",
      channel: r.channel,
      status: r.status,
      errorMessage: r.errorMessage,
      sentAt: r.sentAt,
      deliveredAt: r.deliveredAt,
      openedAt: r.openedAt,
      clickedAt: r.clickedAt,
      failedAt: r.failedAt,
    })),
  });
}
