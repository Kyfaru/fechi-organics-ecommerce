import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";

/** GET /api/admin/campaigns */
export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

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
    return Err.internal();
  }
}

/** POST /api/admin/campaigns — create campaign */
export async function POST(req: Request) {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  let body: {
    name: string;
    type: "EMAIL" | "SMS" | "PUSH";
    audienceType?: string;
    subject?: string;
    content?: string;
    status?: "DRAFT" | "SCHEDULED";
    scheduledAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.name?.trim()) return Err.validation("Campaign name is required");
  if (!["EMAIL", "SMS", "PUSH"].includes(body.type)) return Err.validation("Invalid campaign type");

  try {
    const campaign = await db.campaign.create({
      data: {
        name: body.name.trim(),
        type: body.type,
        audienceType: body.audienceType ?? "ALL",
        subject: body.subject ?? null,
        content: body.content ?? null,
        status: body.status ?? "DRAFT",
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      },
    });
    console.info(`[campaigns/POST] Created campaign: ${campaign.id} — ${campaign.name}`);
    return created(campaign);
  } catch (e) {
    console.error("[campaigns/POST]", e);
    return Err.internal();
  }
}
