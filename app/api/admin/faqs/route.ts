import { db } from "@/lib/db";
import { ok, created, Err } from "@/lib/api";
import { connection, NextRequest } from "next/server";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { requirePermission } from "@/lib/require-permission";

/** GET /api/admin/faqs */
export async function GET(req: NextRequest) {
  await connection();

  const denied = await requirePermission(req, { content: ["view"] });
  if (denied) return denied;

  try {
    const faqs = await db.faq.findMany({
      orderBy: [{ group: "asc" }, { order: "asc" }],
    });
    return ok(faqs);
  } catch (e) {
    console.error("[faqs/GET]", e);
    return Err.internal(e);
  }
}

/** POST /api/admin/faqs — create FAQ */
export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();

  const denied = await requirePermission(req, { content: ["create"] });
  if (denied) return denied;

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
    return Err.internal(e);
  }
}
