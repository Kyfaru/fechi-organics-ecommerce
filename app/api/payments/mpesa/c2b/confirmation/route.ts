/**
 * POST /api/payments/mpesa/c2b/confirmation
 *
 * Safaricom's C2B Confirmation URL — fires for every till/paybill payment
 * received on a registered branch shortcode, regardless of whether an admin
 * is actively "listening" for a match at the time (an admin later matches
 * the amount against this log via the /c2b/matches + /c2b/claim routes).
 * Public, unauthenticated — Safaricom calls it directly.
 *
 * ALWAYS returns 200 — even on internal errors — so Safaricom never retries
 * a payment we've already durably logged (or attempted to).
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

function safaricomOk() {
  return Response.json({ ResultCode: "0", ResultDesc: "Success" }, { status: 200 });
}

interface C2BConfirmationBody {
  TransactionType?: string;
  TransID?: string;
  TransTime?: string; // yyyyMMddHHmmss
  TransAmount?: string; // decimal string KES
  BusinessShortCode?: string;
  BillRefNumber?: string;
  MSISDN?: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

/** Parses Daraja's TransTime format (yyyyMMddHHmmss) into a Date. */
function parseTransTime(raw: string | undefined): Date {
  if (!raw || raw.length !== 14) return new Date();
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6)) - 1;
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));
  const parsed = new Date(Date.UTC(year, month, day, hour, minute, second));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as C2BConfirmationBody;

    if (!body.TransID || !body.BusinessShortCode) {
      console.warn("[c2b/confirmation] Unexpected payload shape", body);
      return safaricomOk();
    }

    const branch = await db.branch.findFirst({
      where: { shortcode: body.BusinessShortCode, isActive: true },
    });

    if (!branch) {
      // Nothing to attach this payment to — still ack so Safaricom stops retrying.
      console.warn(
        `[c2b/confirmation] No active branch for shortcode ${body.BusinessShortCode} — transId=${body.TransID}`,
      );
      return safaricomOk();
    }

    try {
      await db.mpesaC2bTransaction.create({
        data: {
          branchId: branch.id,
          transId: body.TransID,
          transAmount: Math.round(parseFloat(body.TransAmount ?? "0") * 100),
          msisdn: body.MSISDN ?? "",
          firstName: body.FirstName ?? null,
          middleName: body.MiddleName ?? null,
          lastName: body.LastName ?? null,
          transactionTime: parseTransTime(body.TransTime),
          billRefNumber: body.BillRefNumber ?? null,
          rawPayload: body as unknown as Prisma.InputJsonValue,
        },
      });
      console.info(`[c2b/confirmation] Logged — transId=${body.TransID} branch=${branch.id}`);
    } catch (e) {
      // P2002 = unique constraint violation on transId — Safaricom retried a
      // confirmation we already logged. Treat as a no-op, not an error.
      const isDuplicateTransId =
        typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002";
      if (isDuplicateTransId) {
        console.info(`[c2b/confirmation] Duplicate transId (Safaricom retry) — ${body.TransID}`);
      } else {
        console.error("[c2b/confirmation] Failed to log transaction", e);
      }
    }
  } catch (e) {
    console.error("[c2b/confirmation] Processing error", e);
  }

  return safaricomOk();
}
