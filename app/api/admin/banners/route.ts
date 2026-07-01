import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** GET /api/admin/banners */
export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  try {
    const banners = await db.banner.findMany({ orderBy: { name: "asc" } });
    return ok(banners);
  } catch (e) {
    console.error("[banners/GET]", e);
    return Err.internal();
  }
}

/** POST /api/admin/banners — create banner */
export async function POST(req: Request) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  let body: {
    name: string;
    location: string;
    imageKey: string;
    ctaText?: string;
    ctaLink?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.name?.trim()) return Err.validation("Banner name is required");
  if (!body.location) return Err.validation("Location is required");
  if (!body.imageKey) return Err.validation("Image is required");

  try {
    const banner = await db.banner.create({
      data: {
        name: body.name.trim(),
        location: body.location,
        imageKey: body.imageKey,
        ctaText: body.ctaText ?? null,
        ctaLink: body.ctaLink ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: body.status ?? "active",
      },
    });
    console.info(`[banners/POST] Created banner: ${banner.id} — ${banner.name}`);
    return created(banner);
  } catch (e) {
    console.error("[banners/POST]", e);
    return Err.internal();
  }
}
