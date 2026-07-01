import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** GET /api/admin/homepage — return sections ordered by `order` */
export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  try {
    const sections = await db.homepageSection.findMany({
      orderBy: { order: "asc" },
    });
    return ok(sections);
  } catch (e) {
    console.error("[homepage/GET]", e);
    return Err.internal();
  }
}

/** PUT /api/admin/homepage — upsert all sections */
export async function PUT(req: Request) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  let sections: Array<{ id?: string; type: string; order: number; visible: boolean; config: Record<string, unknown> }>;
  try {
    sections = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!Array.isArray(sections)) return Err.validation("Expected an array of sections");

  try {
    await Promise.all(
      sections.map((s) =>
        s.id
          ? db.homepageSection.upsert({
              where: { id: s.id },
              create: { id: s.id, type: s.type, order: s.order, visible: s.visible, config: s.config as Prisma.InputJsonValue },
              update: { type: s.type, order: s.order, visible: s.visible, config: s.config as Prisma.InputJsonValue },
            })
          : db.homepageSection.create({
              data: { type: s.type, order: s.order, visible: s.visible, config: s.config as Prisma.InputJsonValue },
            })
      )
    );
    console.info(`[homepage/PUT] Saved ${sections.length} sections`);
    const updated = await db.homepageSection.findMany({ orderBy: { order: "asc" } });
    return ok(updated);
  } catch (e) {
    console.error("[homepage/PUT]", e);
    return Err.internal();
  }
}
