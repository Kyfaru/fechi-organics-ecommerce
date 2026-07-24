import { r2Client, r2PublicUrl } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export class AttachmentValidationError extends Error {}

export type TicketAttachment = {
  attachmentUrl: string;
  attachmentName: string;
  attachmentType: string;
  attachmentSize: number;
};

// Uploads a single ticket-chat attachment to Cloudflare R2, mirroring
// app/api/account/profile/avatar/route.ts's upload pattern.
export async function uploadTicketAttachment(
  ticketId: string,
  file: File
): Promise<TicketAttachment> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new AttachmentValidationError("Unsupported file type. Only images and PDFs are allowed.");
  }
  if (file.size > MAX_BYTES) {
    throw new AttachmentValidationError("File exceeds 10 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const objectKey = `tickets/${ticketId}/${crypto.randomUUID()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: objectKey,
      Body: buffer,
      ContentType: file.type,
    })
  );

  return {
    attachmentUrl: r2PublicUrl(objectKey),
    attachmentName: file.name,
    attachmentType: file.type,
    attachmentSize: file.size,
  };
}
