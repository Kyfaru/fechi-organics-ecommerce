/**
 * GET /api/admin/exports/[id]/download — same-origin streaming proxy for a
 * generated export file. Same-origin (rather than a direct R2 public URL)
 * sidesteps CORS and lets the client track genuine byte progress via
 * Content-Length + a ReadableStream reader on the fetch response, instead of
 * a fake timed animation.
 *
 * Ownership: the requester, or admin/super_admin (consistent with how every
 * other permission check in this codebase already treats that tier as
 * having universal access — they're also who approved the request).
 */
import { NextRequest, connection } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { Err } from "@/lib/api";
import { requireStaffSession, loadCallerContext } from "@/lib/require-permission";
import { r2Client } from "@/lib/r2";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();

  const denied = await requireStaffSession(req);
  if (denied) return denied;

  const ctx = await loadCallerContext();
  if (ctx.denied) return Err.authRequired();

  const { id } = await params;
  const exportRequest = await db.exportRequest.findUnique({ where: { id } });
  if (!exportRequest) return Err.notFound("Export");

  const isOwner = exportRequest.requestedByAdminProfileId === ctx.id;
  const isTrustedTier = ctx.role === "admin" || ctx.isSuperAdmin;
  if (!isOwner && !isTrustedTier) return Err.forbidden();

  if (exportRequest.status !== "READY" || !exportRequest.fileKey) {
    return Err.validation("This export isn't ready yet.");
  }

  try {
    const object = await r2Client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: exportRequest.fileKey,
    }));
    const bytes = await object.Body!.transformToByteArray();

    if (!exportRequest.deliveredAt) {
      await db.exportRequest.update({ where: { id }, data: { deliveredAt: new Date() } });
    }

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": object.ContentType ?? "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${exportRequest.fileName ?? "export"}"`,
      },
    });
  } catch (e) {
    console.error("[admin/exports/[id]/download] error", e);
    return Err.internal(e);
  }
}
