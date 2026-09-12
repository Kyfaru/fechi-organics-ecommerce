import { NextRequest } from "next/server";
import { connection } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { Argon2id } from "oslo/password";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { loadCallerContext } from "@/lib/require-permission";
import { logActivity } from "@/lib/admin-activity";
import { deleteOrder, type OrderKind } from "@/lib/orders/delete-order";
import { reportError } from "@/lib/observability";

// ---------------------------------------------------------------------------
// POST /api/admin/orders/bulk-delete
// Same permanent deletion as DELETE /api/admin/orders/[id] (super-admin
// only), applied to a batch. Accountability here is the acting admin's OWN
// password rather than retyping every order number — one check gates the
// whole batch instead of forcing N confirmations for N orders.
// ---------------------------------------------------------------------------
const BulkDeleteSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["order", "instore"]),
  })).min(1).max(100),
  reason: z.string().trim().min(1, "A reason is required"),
  password: z.string().min(1, "Password is required"),
}).strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const ctx = await loadCallerContext();
  if (ctx.denied) return ctx.denied === "auth" ? Err.authRequired() : Err.forbidden();
  if (!ctx.isSuperAdmin) return Err.forbidden();

  try {
    const parsed = BulkDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Err.validation(parsed.error.issues[0].message);
    const { items, reason, password } = parsed.data;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Err.authRequired();
    const account = await db.account.findFirst({
      where: { userId: session.user.id, providerId: "credential" },
      select: { password: true },
    });
    if (!account?.password) return Err.validation("No credential account found");
    const validPassword = await new Argon2id().verify(account.password, password);
    if (!validPassword) return Err.validation("Incorrect password");

    const deleted: { id: string; orderNumber: string | null }[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const item of items) {
      try {
        const { orderNumber } = await deleteOrder({
          id: item.id,
          kind: item.kind as OrderKind,
          reason,
          actorAdminProfileId: ctx.id,
        });
        deleted.push({ id: item.id, orderNumber });
      } catch (e) {
        failed.push({ id: item.id, error: e instanceof Error ? e.message : "Delete failed" });
      }
    }

    if (deleted.length > 0) {
      await logActivity(
        ctx.id,
        `Permanently deleted ${deleted.length} order${deleted.length !== 1 ? "s" : ""} in bulk`,
        "order",
        undefined,
        req,
        { reason, orderNumbers: deleted.map((d) => d.orderNumber ?? d.id) },
        "CRITICAL",
      );
    }

    console.info("[admin/orders/bulk-delete] POST —", deleted.length, "deleted,", failed.length, "failed");
    return ok({ deleted, failed });
  } catch (e) {
    reportError(e, { route: "POST /api/admin/orders/bulk-delete", tags: { domain: "orders" } });
    console.error("[admin/orders/bulk-delete] POST error", e);
    return Err.internal();
  }
}
