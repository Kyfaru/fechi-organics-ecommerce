import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { r2Client } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { headers } from "next/headers";
import { assertTrustedOrigin } from "@/lib/origin-check";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  // Auth check — admin only
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string | null) ?? "general";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File must be JPEG, PNG, or WebP" },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File must be smaller than 5 MB" },
        { status: 400 }
      );
    }

    // Determine extension
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const ext = extMap[file.type];

    // Generate object key
    const safeCat = category.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const objectKey = `media/${safeCat}/${crypto.randomUUID()}.${ext}`;

    // Upload to R2
    const buffer = Buffer.from(await file.arrayBuffer());
    await r2Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: objectKey,
        Body: buffer,
        ContentType: file.type,
      })
    );

    // Build public URL
    const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? process.env.R2_PUBLIC_BASE ?? "";
    const publicUrl = publicBase
      ? `${publicBase.replace(/\/$/, "")}/${objectKey}`
      : `/${objectKey}`;

    return NextResponse.json({ objectKey, publicUrl });
  } catch (err) {
    console.error("[R2 Upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
