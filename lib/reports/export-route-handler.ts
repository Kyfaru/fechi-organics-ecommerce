import { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission, loadCallerContext, type PermissionCheck } from "@/lib/require-permission";
import { requireApprovalOrProceed, Approval } from "@/lib/require-approval";
import { r2Client } from "@/lib/r2";
import { exportFiltersSchema } from "@/lib/reports/types";
import { generateExportFile } from "@/lib/reports/generate-export";
import { reportError } from "@/lib/observability";

// Shared by POST /api/admin/orders/export and POST /api/admin/finance/export
// — same flow, different resource string and permission check. Kept as one
// function rather than two near-duplicate route bodies.
export async function handleExportRequest(req: NextRequest, resource: "orders" | "finance") {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;

  const denied = await requirePermission(req, { [resource]: ["export"] } as unknown as PermissionCheck);
  if (denied) return denied;

  const ctx = await loadCallerContext();
  if (ctx.denied) return Err.forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body.");
  }
  const parsed = exportFiltersSchema.safeParse(body);
  if (!parsed.success) return Err.validation(parsed.error.issues[0]?.message ?? "Invalid export filters.");
  const filters = parsed.data;

  try {
    const exportRequest = await db.exportRequest.create({
      data: {
        requestedByAdminProfileId: ctx.id,
        resource,
        format: filters.format,
        filters: filters as unknown as object,
        status: "PENDING",
      },
    });

    const outcome = await requireApprovalOrProceed(ctx, resource, "export", filters, exportRequest.id);
    if (!outcome.proceed) {
      await db.exportRequest.update({ where: { id: exportRequest.id }, data: { approvalRequestId: outcome.requestId } });
      return Approval.queued(outcome.requestId);
    }

    await db.exportRequest.update({ where: { id: exportRequest.id }, data: { status: "GENERATING" } });
    const { buffer, fileName, contentType } = await generateExportFile(resource, filters);
    const fileKey = `exports/${resource}/${exportRequest.id}.${fileName.split(".").pop()}`;
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType,
    }));

    await db.exportRequest.update({
      where: { id: exportRequest.id },
      data: { status: "READY", fileKey, fileName, fileSizeBytes: buffer.byteLength },
    });

    return ok({ exportRequestId: exportRequest.id, ready: true });
  } catch (e) {
    reportError(e, { route: `POST /api/admin/${resource}/export`, tags: { domain: resource } });
    console.error(`[admin/${resource}/export] POST error`, e);
    return Err.internal();
  }
}
