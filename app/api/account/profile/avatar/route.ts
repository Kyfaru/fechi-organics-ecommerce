import { assertTrustedOrigin } from "@/lib/origin-check";
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { r2Client, r2PublicUrl } from "@/lib/r2"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { headers } from "next/headers"

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
]
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 15 MB" }, { status: 400 })
  }

  const ext = file.type.split("/")[1].replace("jpeg", "jpg")
  // ponytail: uploads original format; add sharp WebP conversion if storage cost matters
  const objectKey = `avatars/${session.user.id}/${crypto.randomUUID()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: objectKey,
      Body: buffer,
      ContentType: file.type,
    })
  )

  const publicUrl = r2PublicUrl(objectKey)

  await db.user.update({
    where: { id: session.user.id },
    data: { image: publicUrl },
  })

  return NextResponse.json({ url: publicUrl })
}
