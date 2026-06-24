import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ok, created, Err } from "@/lib/api";
import { r2PublicUrl } from "@/lib/r2";
import { z } from "zod";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Auth helper — resolves to the user row if they are an admin, else null
// ---------------------------------------------------------------------------
async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = await db.user.findUnique({ where: { id: session.user.id } });
  return u?.role === "admin" ? u : null;
}

// ---------------------------------------------------------------------------
// Attach resolved public URLs to a testimonial row before returning to client.
// Keeps URL construction server-side where NEXT_PUBLIC_R2_PUBLIC_URL is stable.
// ---------------------------------------------------------------------------
function withUrls(t: { beforeKey: string; afterKey: string; [key: string]: unknown }) {
  return {
    ...t,
    beforeUrl: r2PublicUrl(t.beforeKey),
    afterUrl: r2PublicUrl(t.afterKey),
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/testimonials
// Returns all testimonials ordered by sortOrder ascending.
// Each record includes beforeUrl and afterUrl resolved via r2PublicUrl().
// ---------------------------------------------------------------------------
export async function GET() {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const rows = await db.testimonial.findMany({
      orderBy: { sortOrder: "asc" },
    });

    return ok({ testimonials: rows.map(withUrls) });
  } catch (e) {
    console.error("[admin/testimonials] GET error", e);
    return Err.internal();
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/testimonials
// Creates a new testimonial.
// Body: { authorName, location?, quote, rating, beforeKey, afterKey, source? }
// Returns 201 with the created record including beforeUrl / afterUrl.
// ---------------------------------------------------------------------------
const CreateSchema = z.object({
  authorName: z.string().min(1, "Author name is required"),
  location: z.string().optional(),
  quote: z.string().min(1, "Quote is required"),
  rating: z.number().int().min(1).max(5).default(5),
  beforeKey: z.string().min(1, "Before image key is required"),
  afterKey: z.string().min(1, "After image key is required"),
  source: z.enum(["facebook", "manual"]).default("manual"),
  sortOrder: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest) {
  await connection();
  try {
    const admin = await requireAdmin();
    if (!admin) return Err.forbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const t = await db.testimonial.create({ data: parsed.data });

    console.info("[admin/testimonials] created", t.id);
    return created({ testimonial: withUrls(t) });
  } catch (e) {
    console.error("[admin/testimonials] POST error", e);
    return Err.internal();
  }
}
