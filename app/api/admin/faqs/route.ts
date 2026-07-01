import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connection } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";

/** GET /api/admin/faqs */
export async function GET() {
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  try {
    const faqs = await db.faq.findMany({
      orderBy: [{ group: "asc" }, { order: "asc" }],
    });
    return ok(faqs);
  } catch (e) {
    console.error("[faqs/GET]", e);
    return Err.internal();
  }
}

/** POST /api/admin/faqs — create FAQ */
export async function POST(req: Request) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Err.authRequired();

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "admin") return Err.forbidden();

  let body: { question: string; answer: string; group?: string; order?: number; status?: string };
  try {
    body = await req.json();
  } catch {
    return Err.validation("Invalid JSON body");
  }

  if (!body.question?.trim()) return Err.validation("Question is required");
  if (!body.answer?.trim()) return Err.validation("Answer is required");

  try {
    const faq = await db.faq.create({
      data: {
        question: body.question.trim(),
        answer: body.answer.trim(),
        group: body.group ?? "General",
        order: body.order ?? 0,
        status: body.status ?? "published",
      },
    });
    console.info(`[faqs/POST] Created FAQ: ${faq.id}`);
    return created(faq);
  } catch (e) {
    console.error("[faqs/POST]", e);
    return Err.internal();
  }
}
