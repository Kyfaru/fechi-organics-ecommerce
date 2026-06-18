import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { qstashReceiver } from "@/lib/qstash";
import { r2Client } from "@/lib/r2";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const signature = req.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const isValid = await qstashReceiver.verify({ signature, body: rawBody });
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { productId, fileBase64, fileName, category } = JSON.parse(rawBody) as {
    productId: string;
    fileBase64: string;
    fileName: string;
    category: string;
  };

  const buffer = Buffer.from(fileBase64, "base64");
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const objectKey = `media/${category}/${crypto.randomUUID()}.${ext}`;
  const contentType =
    ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : "image/jpeg";

  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const existing = await db.productImage.findFirst({
    where: { productId },
    orderBy: { sortOrder: "asc" },
  });

  if (existing) {
    await db.productImage.update({
      where: { id: existing.id },
      data: { objectKey, isPrimary: true },
    });
  } else {
    await db.productImage.create({
      data: { productId, objectKey, isPrimary: true, sortOrder: 0 },
    });
  }

  return NextResponse.json({ ok: true });
}
