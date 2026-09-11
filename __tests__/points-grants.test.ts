import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * In-memory stand-in for the grant tables, so the unanimous-quorum logic can be
 * exercised without a database. Only the fields lib/points/grants.ts reads.
 */
type Admin = {
  id: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  accessExpiresAt: Date | null;
  pointsAllowance: number;
  pointsAllowanceSpent: number;
  fullName: string;
};
type Request = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  points: number;
  targetUserId: string;
  requestedByAdminProfileId: string;
  decidedAt: Date | null;
};
type Approval = { requestId: string; adminProfileId: string; decision: "APPROVED" | "REJECTED" };

const state = {
  admins: [] as Admin[],
  requests: [] as Request[],
  approvals: [] as Approval[],
  ledger: [] as Array<{ userId: string; delta: number; refId: string | null }>,
  seq: 0,
};

const awardPoints = vi.fn(async (a: { userId: string; delta: number; refId?: string | null }) => {
  // Mirrors the real unique constraint on (userId, reason, refType, refId).
  if (state.ledger.some((l) => l.refId === a.refId)) return null;
  state.ledger.push({ userId: a.userId, delta: a.delta, refId: a.refId ?? null });
  return { id: `e${++state.seq}` };
});

vi.mock("@/lib/points/ledger", () => ({ awardPoints: (a: never) => awardPoints(a) }));
vi.mock("@/lib/notify", () => ({ createNotification: () => Promise.resolve() }));
vi.mock("@/lib/db", () => ({
  db: {
    adminProfile: {
      findMany: async () =>
        state.admins.filter(
          (a) =>
            a.isSuperAdmin &&
            a.isActive &&
            (a.accessExpiresAt === null || a.accessExpiresAt > new Date()),
        ),
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.admins.find((a) => a.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { pointsAllowanceSpent: { increment: number } } }) => {
        const a = state.admins.find((x) => x.id === where.id)!;
        a.pointsAllowanceSpent += data.pointsAllowanceSpent.increment;
        return a;
      },
    },
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
    pointsGrantRequest: {
      create: async ({ data }: { data: Omit<Request, "id" | "status" | "decidedAt"> }) => {
        const r: Request = { ...data, id: `r${state.requests.length + 1}`, status: "PENDING", decidedAt: null };
        state.requests.push(r);
        return r;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = state.requests.find((x) => x.id === where.id);
        if (!r) return null;
        return { ...r, approvals: state.approvals.filter((a) => a.requestId === r.id) };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Request> }) => {
        const r = state.requests.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
    },
    pointsGrantApproval: {
      create: async ({ data }: { data: Approval }) => {
        state.approvals.push(data);
        return data;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { requestId_adminProfileId: { requestId: string; adminProfileId: string } };
        create: Approval;
        update: { decision: "APPROVED" | "REJECTED" };
      }) => {
        const key = where.requestId_adminProfileId;
        const found = state.approvals.find(
          (a) => a.requestId === key.requestId && a.adminProfileId === key.adminProfileId,
        );
        if (found) found.decision = update.decision;
        else state.approvals.push(create);
        return create;
      },
    },
  },
}));

const { createGrantRequest, voteOnGrant, GrantError } = await import("@/lib/points/grants");

function admin(id: string, over: Partial<Admin> = {}): Admin {
  return {
    id,
    isSuperAdmin: true,
    isActive: true,
    accessExpiresAt: null,
    pointsAllowance: 100_000,
    pointsAllowanceSpent: 0,
    fullName: id,
    ...over,
  };
}

beforeEach(() => {
  state.admins = [];
  state.requests = [];
  state.approvals = [];
  state.ledger = [];
  state.seq = 0;
  awardPoints.mockClear();
});

describe("unanimous points grants", () => {
  it("stays pending until every active super admin approves", async () => {
    state.admins = [admin("sa1"), admin("sa2"), admin("sa3")];

    const created = await createGrantRequest({
      requesterAdminProfileId: "sa1",
      targetUserId: "cust-1",
      points: 5_000,
      note: "Goodwill after a delivery mishap",
    });
    // Requesting counts as sa1's own approval — 1 of 3.
    expect(created).toMatchObject({ status: "PENDING", approvals: 1, required: 3 });
    expect(state.ledger).toHaveLength(0);

    const second = await voteOnGrant({ requestId: "r1", adminProfileId: "sa2", decision: "APPROVED" });
    expect(second).toMatchObject({ status: "PENDING", approvals: 2, required: 3 });
    expect(state.ledger).toHaveLength(0);

    const third = await voteOnGrant({ requestId: "r1", adminProfileId: "sa3", decision: "APPROVED" });
    expect(third).toMatchObject({ status: "APPROVED", points: 5_000 });
    expect(state.ledger).toEqual([{ userId: "cust-1", delta: 5_000, refId: "r1" }]);
  });

  it("releases immediately when there is only one super admin", async () => {
    state.admins = [admin("sa1")];
    const created = await createGrantRequest({
      requesterAdminProfileId: "sa1",
      targetUserId: "cust-1",
      points: 100,
      note: "Sole super admin",
    });
    expect(created).toMatchObject({ status: "APPROVED" });
  });

  it("is killed by a single rejection", async () => {
    state.admins = [admin("sa1"), admin("sa2"), admin("sa3")];
    await createGrantRequest({
      requesterAdminProfileId: "sa1",
      targetUserId: "cust-1",
      points: 5_000,
      note: "Goodwill",
    });
    await voteOnGrant({ requestId: "r1", adminProfileId: "sa2", decision: "APPROVED" });

    const out = await voteOnGrant({ requestId: "r1", adminProfileId: "sa3", decision: "REJECTED" });
    expect(out).toMatchObject({ status: "REJECTED" });
    expect(state.ledger).toHaveLength(0);
  });

  it("never pays out twice on a replayed settle", async () => {
    state.admins = [admin("sa1"), admin("sa2")];
    await createGrantRequest({
      requesterAdminProfileId: "sa1",
      targetUserId: "cust-1",
      points: 1_000,
      note: "Goodwill",
    });
    await voteOnGrant({ requestId: "r1", adminProfileId: "sa2", decision: "APPROVED" });
    expect(state.ledger).toHaveLength(1);

    await expect(
      voteOnGrant({ requestId: "r1", adminProfileId: "sa2", decision: "APPROVED" }),
    ).rejects.toBeInstanceOf(GrantError);
    expect(state.ledger).toHaveLength(1);
    expect(state.admins[0].pointsAllowanceSpent).toBe(1_000);
  });

  it("does not deadlock when a super admin leaves mid-flight", async () => {
    state.admins = [admin("sa1"), admin("sa2"), admin("sa3")];
    await createGrantRequest({
      requesterAdminProfileId: "sa1",
      targetUserId: "cust-1",
      points: 2_000,
      note: "Goodwill",
    });
    await voteOnGrant({ requestId: "r1", adminProfileId: "sa2", decision: "APPROVED" });

    // sa3 is deactivated before voting. Quorum is recomputed, not snapshotted.
    state.admins[2].isActive = false;
    const out = await voteOnGrant({ requestId: "r1", adminProfileId: "sa2", decision: "APPROVED" });
    expect(out).toMatchObject({ status: "APPROVED" });
  });

  it("ignores a super admin whose access has expired", async () => {
    state.admins = [
      admin("sa1"),
      admin("sa2", { accessExpiresAt: new Date(Date.now() - 86_400_000) }),
    ];
    const out = await createGrantRequest({
      requesterAdminProfileId: "sa1",
      targetUserId: "cust-1",
      points: 500,
      note: "Goodwill",
    });
    expect(out).toMatchObject({ status: "APPROVED" });
  });

  it("debits the requester's allowance and blocks once it runs out", async () => {
    state.admins = [admin("sa1", { pointsAllowanceSpent: 99_000 })];

    await createGrantRequest({
      requesterAdminProfileId: "sa1",
      targetUserId: "cust-1",
      points: 1_000,
      note: "Last of the allowance",
    });
    expect(state.admins[0].pointsAllowanceSpent).toBe(100_000);

    await expect(
      createGrantRequest({
        requesterAdminProfileId: "sa1",
        targetUserId: "cust-2",
        points: 1,
        note: "One more",
      }),
    ).rejects.toThrow(/cannot be renewed/);
  });

  it("refuses a non-super-admin, an inactive one, and a bad amount", async () => {
    state.admins = [admin("sa1"), admin("mgr", { isSuperAdmin: false }), admin("old", { isActive: false })];

    await expect(
      createGrantRequest({ requesterAdminProfileId: "mgr", targetUserId: "c", points: 10, note: "x" }),
    ).rejects.toThrow(/super admin/i);

    await expect(
      createGrantRequest({ requesterAdminProfileId: "old", targetUserId: "c", points: 10, note: "x" }),
    ).rejects.toThrow(/super admin/i);

    await expect(
      createGrantRequest({ requesterAdminProfileId: "sa1", targetUserId: "c", points: 0, note: "x" }),
    ).rejects.toThrow(/positive/i);

    await expect(
      createGrantRequest({ requesterAdminProfileId: "sa1", targetUserId: "c", points: 10, note: "  " }),
    ).rejects.toThrow(/reason is required/i);
  });

  it("refuses a vote from a non-super-admin", async () => {
    state.admins = [admin("sa1"), admin("sa2"), admin("mgr", { isSuperAdmin: false })];
    await createGrantRequest({
      requesterAdminProfileId: "sa1",
      targetUserId: "cust-1",
      points: 100,
      note: "Goodwill",
    });
    await expect(
      voteOnGrant({ requestId: "r1", adminProfileId: "mgr", decision: "APPROVED" }),
    ).rejects.toThrow(/super admin/i);
    expect(state.ledger).toHaveLength(0);
  });
});
