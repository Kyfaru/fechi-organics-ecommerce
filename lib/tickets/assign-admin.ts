import { db } from "@/lib/db";

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];
type DbOrTx = typeof db | TxClient;

const DEFAULT_CAP = 10;
const RAISED_CAP = 50;
const DEFAULT_RAISE_THRESHOLD = 50; // total open tickets across all eligible admins

// systemConfig keys — plain rows, no dedicated table (per Phase 2's systemConfig model)
const CURSOR_KEY = "ticket_assignment_cursor";
const CAP_KEY = "ticket_assignment_cap";
const RAISE_THRESHOLD_KEY = "ticket_assignment_raise_threshold";

// ---------------------------------------------------------------------------
// Assigns a newly created support ticket to an eligible admin/customer_care
// staff member.
//
// Why it exists: unassigned tickets have no accountable owner and pile up
// silently. Round-robin keeps load roughly even across the team; the cap
// self-raises (10 -> 50 per admin) when total open load crosses a threshold,
// so assignment never fully stalls just because everyone is busy at once —
// no manual toggle required.
//
// Eligibility: adminProfile.role in ("admin", "customer_care") AND isActive.
// - 0 eligible admins -> returns null; caller creates the ticket unassigned.
// - 1 eligible admin -> always assigned to them (no round-robin needed).
// - 2+ -> round-robin via the `ticket_assignment_cursor` systemConfig row,
//   skipping anyone at the cap; if everyone is at the (possibly raised) cap,
//   falls back to whoever currently has the fewest open tickets rather than
//   leaving the ticket unassigned.
//
// @param client - db or an active transaction client. Pass the same tx used
//                 for the ticket's create() when calling inside a
//                 transaction, so the cursor read/write and the ticket
//                 insert are atomic with respect to concurrent callers.
// @returns The chosen admin's user.id, or null if no eligible admin exists.
// ---------------------------------------------------------------------------
export async function assignTicketToAdmin(client: DbOrTx = db): Promise<string | null> {
  const eligible = await client.adminProfile.findMany({
    where: { role: { in: ["admin", "customer_care"] }, isActive: true },
    select: { userId: true },
    orderBy: { userId: "asc" }, // stable order — required for round-robin cursor math
  });

  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0].userId;

  const [capRow, thresholdRow, cursorRow] = await Promise.all([
    client.systemConfig.findUnique({ where: { key: CAP_KEY } }),
    client.systemConfig.findUnique({ where: { key: RAISE_THRESHOLD_KEY } }),
    client.systemConfig.findUnique({ where: { key: CURSOR_KEY } }),
  ]);

  const raiseThreshold =
    typeof thresholdRow?.value === "number" ? thresholdRow.value : DEFAULT_RAISE_THRESHOLD;

  const totalOpen = await client.supportTicket.count({
    where: { assignedAdminId: { in: eligible.map((a) => a.userId) }, status: "OPEN" },
  });

  const cap = totalOpen >= raiseThreshold ? RAISED_CAP : DEFAULT_CAP;

  // Self-heal the stored cap every run so it stays truthful without a manual
  // toggle — visible to whoever inspects /api/admin/settings later.
  if (capRow?.value !== cap) {
    await client.systemConfig.upsert({
      where: { key: CAP_KEY },
      create: { key: CAP_KEY, value: cap },
      update: { value: cap },
    });
  }

  const lastIndex = typeof cursorRow?.value === "number" ? cursorRow.value : -1;

  // Walk the ring starting just after the last-assigned admin, skipping
  // anyone already at the cap, until every eligible admin has been checked.
  for (let step = 1; step <= eligible.length; step++) {
    const index = (lastIndex + step) % eligible.length;
    const candidate = eligible[index];
    const openCount = await client.supportTicket.count({
      where: { assignedAdminId: candidate.userId, status: "OPEN" },
    });
    if (openCount < cap) {
      await client.systemConfig.upsert({
        where: { key: CURSOR_KEY },
        create: { key: CURSOR_KEY, value: index },
        update: { value: index },
      });
      return candidate.userId;
    }
  }

  // Everyone is at the (raised) cap — assign to whoever has the least load
  // rather than leaving the ticket unassigned.
  const loads = await Promise.all(
    eligible.map(async (a) => ({
      userId: a.userId,
      openCount: await client.supportTicket.count({
        where: { assignedAdminId: a.userId, status: "OPEN" },
      }),
    }))
  );
  loads.sort((a, b) => a.openCount - b.openCount);
  return loads[0].userId;
}
