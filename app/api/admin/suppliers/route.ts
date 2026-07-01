import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** GET /api/admin/suppliers */
export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  try {
    const suppliers = await db.supplier.findMany({
      include: {
        purchaseOrders: {
          take: 5,
          orderBy: { createdAt: "desc" },
          select: { id: true, poNumber: true, status: true, totalAmount: true, createdAt: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return ok(suppliers);
  } catch (e) {
    console.error("[suppliers/GET]", e);
    return Err.internal();
  }
}

/** POST /api/admin/suppliers — create supplier */
export async function POST(req: Request) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  let body: {
    name: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    categories?: string[];
    paymentTerms?: string;
    notes?: string;
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.name?.trim()) return Err.validation("Supplier name is required");

  try {
    const supplier = await db.supplier.create({
      data: {
        name: body.name.trim(),
        contactPerson: body.contactPerson ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        categories: body.categories ?? [],
        paymentTerms: body.paymentTerms ?? null,
        notes: body.notes ?? null,
        status: body.status ?? "active",
      },
    });
    console.info(`[suppliers/POST] Created supplier: ${supplier.id} — ${supplier.name}`);
    return created(supplier);
  } catch (e) {
    console.error("[suppliers/POST]", e);
    return Err.internal();
  }
}
