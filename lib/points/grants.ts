/**
 * Hand-granting points, under unanimous super-admin approval.
 *
 * This is the ONLY way points enter the system without a customer earning
 * them, and it is deliberately awkward:
 *
 *  - Only a super admin may request a grant.
 *  - Every currently-active super admin must approve it, the requester
 *    included (their request counts as their own approval).
 *  - A single rejection kills it.
 *  - The points come out of the requester's personal lifetime allowance
 *    (100,000, set once), which no UI or API can top back up — only a direct
 *    database UPDATE.
 *
 * The quorum is recomputed against *currently active* super admins on every
 * vote rather than snapshotted at creation. Snapshotting would deadlock any
 * pending request the moment a super admin left the company.
 *
 * requireApprovalOrProceed() in lib/require-approval.ts cannot be reused here —
 * it short-circuits for super admins by design.
 */

import { db } from "@/lib/db";
import { awardPoints } from "@/lib/points/ledger";
import { createNotification } from "@/lib/notify";

export type GrantOutcome =
  | { status: "PENDING"; approvals: number; required: number; requestId: string }
  | { status: "APPROVED"; requestId: string; points: number }
  | { status: "REJECTED"; requestId: string };

/** Super admins who can currently vote. Access-expired accounts do not count. */
export async function activeSuperAdmins() {
  const now = new Date();
  return db.adminProfile.findMany({
    where: {
      isSuperAdmin: true,
      isActive: true,
      OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: now } }],
    },
    select: { id: true, fullName: true, pointsAllowance: true, pointsAllowanceSpent: true },
  });
}

export class GrantError extends Error {}

export async function createGrantRequest(args: {
  requesterAdminProfileId: string;
  targetUserId: string;
  points: number;
  note: string;
}): Promise<GrantOutcome> {
  if (!Number.isInteger(args.points) || args.points <= 0) {
    throw new GrantError("Points must be a positive whole number");
  }
  if (!args.note.trim()) {
    throw new GrantError("A reason is required for every grant");
  }

  const requester = await db.adminProfile.findUnique({
    where: { id: args.requesterAdminProfileId },
    select: { id: true, isSuperAdmin: true, isActive: true, pointsAllowance: true, pointsAllowanceSpent: true },
  });
  if (!requester?.isSuperAdmin || !requester.isActive) {
    throw new GrantError("Only an active super admin may request a points grant");
  }

  const remaining = requester.pointsAllowance - requester.pointsAllowanceSpent;
  if (args.points > remaining) {
    throw new GrantError(
      `Your remaining allowance is ${remaining.toLocaleString()} points. It cannot be renewed.`,
    );
  }

  const target = await db.user.findUnique({ where: { id: args.targetUserId }, select: { id: true } });
  if (!target) throw new GrantError("That customer does not exist");

  const request = await db.pointsGrantRequest.create({
    data: {
      requestedByAdminProfileId: requester.id,
      targetUserId: args.targetUserId,
      points: args.points,
      note: args.note.trim(),
    },
  });

  // Requesting is approving.
  await db.pointsGrantApproval.create({
    data: { requestId: request.id, adminProfileId: requester.id, decision: "APPROVED" },
  });

  createNotification({
    type: "LOYALTY_GRANT_REQUESTED",
    title: "Points grant needs your approval",
    body: `A grant of ${args.points.toLocaleString()} points is waiting. Every active super admin must approve before it is released.`,
    link: "/admin/loyalty/grants",
    branchId: null,
  }).catch(() => {});

  return settle(request.id);
}

export async function voteOnGrant(args: {
  requestId: string;
  adminProfileId: string;
  decision: "APPROVED" | "REJECTED";
}): Promise<GrantOutcome> {
  const voter = await db.adminProfile.findUnique({
    where: { id: args.adminProfileId },
    select: { isSuperAdmin: true, isActive: true },
  });
  if (!voter?.isSuperAdmin || !voter.isActive) {
    throw new GrantError("Only an active super admin may vote on a points grant");
  }

  const request = await db.pointsGrantRequest.findUnique({
    where: { id: args.requestId },
    select: { status: true },
  });
  if (!request) throw new GrantError("Grant request not found");
  if (request.status !== "PENDING") throw new GrantError("That grant has already been decided");

  await db.pointsGrantApproval.upsert({
    where: { requestId_adminProfileId: { requestId: args.requestId, adminProfileId: args.adminProfileId } },
    create: { requestId: args.requestId, adminProfileId: args.adminProfileId, decision: args.decision },
    update: { decision: args.decision, decidedAt: new Date() },
  });

  return settle(args.requestId);
}

/**
 * Decides a request if it now has a unanimous verdict, and releases the points
 * if so. Idempotent: the ledger's unique key on (grant, requestId) means a
 * concurrent double-settle cannot pay out twice.
 */
async function settle(requestId: string): Promise<GrantOutcome> {
  const request = await db.pointsGrantRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      points: true,
      targetUserId: true,
      requestedByAdminProfileId: true,
      approvals: { select: { adminProfileId: true, decision: true } },
    },
  });
  if (!request) throw new GrantError("Grant request not found");
  if (request.status !== "PENDING") {
    return request.status === "APPROVED"
      ? { status: "APPROVED", requestId, points: request.points }
      : { status: "REJECTED", requestId };
  }

  if (request.approvals.some((a) => a.decision === "REJECTED")) {
    await db.pointsGrantRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    createNotification({
      type: "LOYALTY_GRANT_RELEASED",
      title: "Points grant rejected",
      body: `A grant of ${request.points.toLocaleString()} points was rejected.`,
      link: "/admin/loyalty/grants",
      branchId: null,
    }).catch(() => {});
    return { status: "REJECTED", requestId };
  }

  const voters = await activeSuperAdmins();
  const approvedBy = new Set(
    request.approvals.filter((a) => a.decision === "APPROVED").map((a) => a.adminProfileId),
  );
  const outstanding = voters.filter((v) => !approvedBy.has(v.id));

  if (outstanding.length > 0) {
    return {
      status: "PENDING",
      requestId,
      approvals: voters.length - outstanding.length,
      required: voters.length,
    };
  }

  // Unanimous. Debit the requester and write the entry.
  const requester = await db.adminProfile.findUnique({
    where: { id: request.requestedByAdminProfileId },
    select: { pointsAllowance: true, pointsAllowanceSpent: true },
  });
  const remaining = (requester?.pointsAllowance ?? 0) - (requester?.pointsAllowanceSpent ?? 0);
  if (remaining < request.points) {
    throw new GrantError(
      `The requester's allowance has fallen to ${remaining.toLocaleString()} points since this was raised`,
    );
  }

  const entry = await awardPoints({
    userId: request.targetUserId,
    delta: request.points,
    reason: "SUPER_ADMIN_GRANT",
    refType: "grant",
    refId: requestId,
    meta: { approvedBy: [...approvedBy] },
  });

  // Only spend the allowance if this call actually created the entry — a
  // concurrent settle that lost the race gets null back and must not double-debit.
  if (entry) {
    await db.adminProfile.update({
      where: { id: request.requestedByAdminProfileId },
      data: { pointsAllowanceSpent: { increment: request.points } },
    });
  }

  await db.pointsGrantRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", decidedAt: new Date() },
  });

  createNotification({
    type: "LOYALTY_GRANT_RELEASED",
    title: "Points grant released",
    body: `${request.points.toLocaleString()} points were granted after unanimous approval by ${voters.length} super admin${voters.length === 1 ? "" : "s"}.`,
    link: "/admin/loyalty/grants",
    branchId: null,
  }).catch(() => {});

  return { status: "APPROVED", requestId, points: request.points };
}
