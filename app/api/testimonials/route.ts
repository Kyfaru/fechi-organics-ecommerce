import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { created, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";

/**
 * POST /api/testimonials — public create-testimony submission. No auth
 * required (anonymous testimonies are allowed), secured the same way as
 * /api/contact: origin check + Zod validation + per-IP rate limiting.
 * Always lands with approved: false, same as the admin-created and
 * account/reviews paths — nothing here bypasses admin moderation.
 */
const CreateTestimonySchema = z
  .object({
    authorName: z.string().min(2).max(100),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().max(30).optional(),
    location: z.string().max(200).optional(),
    productIds: z.array(z.string()).max(20).default([]),
    rating: z.number().int().min(1).max(5),
    quote: z.string().min(10).max(2000),
    beforeKey: z.string().optional(),
    afterKey: z.string().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateTestimonySchema.safeParse(body);
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const redis = getRedis();
    const rateKey = `fechi:ratelimit:testimonial-submit:${ip}`;
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 300);
    if (count > 3) return Err.rateLimited();

    const { authorName, contactEmail, contactPhone, location, productIds, rating, quote, beforeKey, afterKey } =
      parsed.data;

    const testimonial = await db.testimonial.create({
      data: {
        authorName,
        contactEmail,
        contactPhone,
        location,
        productIds,
        rating,
        quote,
        beforeKey,
        afterKey,
        source: "manual",
        approved: false,
      },
    });

    console.info("[testimonials] submission created:", testimonial.id);
    return created({ id: testimonial.id });
  } catch (e) {
    console.error("[testimonials] POST error", e);
    return Err.internal(e);
  }
}
