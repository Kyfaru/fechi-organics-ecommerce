import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { r2Client } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { getRedis } from "@/lib/redis";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB (pre-compression)
const MAX_DIMENSION = 1600;

/**
 * POST /api/testimonials/upload — public before/after photo upload for the
 * create-testimony flow. No auth required (anonymous testimony submission),
 * but rate-limited + origin-checked like /api/contact. Images are resized
 * and re-encoded to WebP before landing in R2 — the only upload path in the
 * app that actually compresses, closing the debt flagged elsewhere
 * (ponytail: account/reviews and profile/avatar routes still upload raw).
 */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const redis = getRedis();
  const rateKey = `fechi:ratelimit:testimonial-upload:${ip}`;
  const count = await redis.incr(rateKey);
  if (count === 1) await redis.expire(rateKey, 60);
  if (count > 10) return NextResponse.json({ error: "Too many uploads. Please try again shortly." }, { status: 429 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "File must be JPEG, PNG, or WebP" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be smaller than 8 MB" }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(inputBuffer)
      .rotate() // apply EXIF orientation before stripping metadata
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const objectKey = `media/testimonials/${crypto.randomUUID()}.webp`;
    await r2Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: objectKey,
        Body: compressed,
        ContentType: "image/webp",
      })
    );

    return NextResponse.json({ ok: true, objectKey });
  } catch (err) {
    console.error("[testimonials/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
