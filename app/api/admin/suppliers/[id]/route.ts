import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** PATCH /api/admin/suppliers/[id] — update supplier */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  try {
    const supplier = await db.supplier.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name) }),
        ...(body.contactPerson !== undefined && { contactPerson: body.contactPerson ? String(body.contactPerson) : null }),
        ...(body.email !== undefined && { email: body.email ? String(body.email) : null }),
        ...(body.phone !== undefined && { phone: body.phone ? String(body.phone) : null }),
        ...(body.address !== undefined && { address: body.address ? String(body.address) : null }),
        ...(body.categories !== undefined && { categories: body.categories as string[] }),
        ...(body.paymentTerms !== undefined && { paymentTerms: body.paymentTerms ? String(body.paymentTerms) : null }),
        ...(body.notes !== undefined && { notes: body.notes ? String(body.notes) : null }),
        ...(body.status !== undefined && { status: String(body.status) }),
      },
    });
    console.info(`[suppliers/PATCH] Updated supplier: ${id}`);
    return ok(supplier);
  } catch (e) {
    console.error("[suppliers/PATCH]", e);
    return Err.internal();
  }
}

/** DELETE /api/admin/suppliers/[id] — soft delete (set status to inactive) */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = assertTrustedOrigin(_req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  const { id } = await params;

  try {
    const supplier = await db.supplier.update({
      where: { id },
      data: { status: "inactive" },
    });
    console.info(`[suppliers/DELETE] Soft-deleted supplier: ${id}`);
    return ok({ id: supplier.id, status: "inactive" });
  } catch (e) {
    console.error("[suppliers/DELETE]", e);
    return Err.internal();
  }
}
