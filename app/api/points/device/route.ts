/**
 * POST /api/points/device
 *
 * Records the caller's device and IP signals for anti-farming scoring. The
 * browser posts a raw fingerprint string; the server HMACs it before storing,
 * so identifying detail is never retained (lib/points/anti-abuse.ts).
 *
 * Called once after signup and again at checkout. Cheap and idempotent — the
 * identitySignal table is keyed on (userId, kind, valueHash), so repeats just
 * bump lastSeenAt.
 *
 * The score itself is only ever computed at first payment, when there is a
 * payment instrument to weigh alongside these. Recording here just means the
 * evidence exists by then.
 */

import { NextRequest } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ok, Err } from "@/lib/api";
import { assertTrustedOrigin } from "@/lib/origin-check";
import { recordSignal, ipSubnet } from "@/lib/points/anti-abuse";
import { makeRatelimit } from "@/lib/ratelimit";
import { Ratelimit } from "@upstash/ratelimit";
import { reportError } from "@/lib/observability";

const limiter = makeRatelimit(Ratelimit.slidingWindow(10, "1 m"), "points_device");

const bodySchema = z
  .object({
    fingerprint: z.string().min(8).max(2000).nullable().optional(),
    deviceId: z.string().min(8).max(128).nullable().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const originCheck = assertTrustedOrigin(req);
  if (originCheck) return originCheck;
  await connection();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) return Err.authRequired();
    const userId = session.user.id;

    if (limiter) {
      const { success } = await limiter.limit(userId);
      if (!success) return Err.rateLimited();
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Err.validation("Invalid device payload");

    // Both browser signals are one DEVICE kind — either matching another
    // account is the same evidence, and storing them separately would double
    // the weight of a single machine.
    if (parsed.data.fingerprint) {
      await recordSignal(userId, "DEVICE", parsed.data.fingerprint);
    }
    if (parsed.data.deviceId) {
      await recordSignal(userId, "DEVICE", parsed.data.deviceId);
    }

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) {
      await recordSignal(userId, "IP", ipSubnet(forwarded));
    }

    return ok({ recorded: true });
  } catch (e) {
    reportError(e, { route: "POST /api/points/device", tags: { domain: "loyalty" } });
    return Err.internal();
  }
}
