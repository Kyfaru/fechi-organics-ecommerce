/**
 * POST /api/admin/workers/dispatch-stk
 *
 * QStash-triggered: actually sends the STK push, off the customer-facing
 * request path. Published by the initiate routes right after they create the
 * order + PENDING transaction rows. The job body lives in
 * lib/payments/run-dispatch-job.ts, shared with the initiate routes' after()
 * fast path — a Redis NX claim there guarantees one prompt per transaction no
 * matter which entry point gets there first (or QStash redelivers).
 *
 * Returns 200 for every terminal outcome; a non-2xx (QStash retry) is only
 * for the narrow case where the claim itself couldn't be taken.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyQstashRequest } from "@/lib/qstash";
import { runDispatchJob } from "@/lib/payments/run-dispatch-job";

// Worst case is a full primary + fallback attempt, each up to 10s token +
// 15s STK push.
export const maxDuration = 60;

type Job = { kind: "online" | "instore"; transactionId: string };

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const isValid = await verifyQstashRequest(req.headers.get("upstash-signature"), rawBody);
  if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const { kind, transactionId } = JSON.parse(rawBody) as Job;
  const { httpStatus, body } = await runDispatchJob(kind, transactionId);
  return NextResponse.json(body, { status: httpStatus });
}
