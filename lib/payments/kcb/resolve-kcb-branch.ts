import { db } from "@/lib/db";

type BranchForKcb = {
  id: string;
  shortcode: string | null;
  invoiceNumber: string | null;
  consumerKeyEnc: string;
  consumerSecretEnc: string;
  apiKeyEnc: string | null;
};

/**
 * Eldoret, Kitengela and Mwea only have Daraja till credentials seeded (no
 * KCB Buni invoiceNumber/apiKey) — see prisma/set-daraja-creds.ts. When the
 * dispatcher routes one of these branches through KCB_BUNI, there's no
 * per-branch account to bill against, so settle through the head office
 * (isMain) branch's KCB Buni paybill instead. Callers must keep using the
 * order/transaction's own branchId for everything else (Zoho location,
 * reporting) — only the payment-processing credentials are swapped here.
 */
export async function resolveKcbBranch<T extends BranchForKcb>(branch: T): Promise<BranchForKcb> {
  if (branch.invoiceNumber && branch.apiKeyEnc) return branch;

  const headOffice = await db.branch.findFirst({
    where: { isMain: true, isActive: true },
    select: {
      id: true,
      shortcode: true,
      invoiceNumber: true,
      consumerKeyEnc: true,
      consumerSecretEnc: true,
      apiKeyEnc: true,
    },
  });
  if (!headOffice?.invoiceNumber || !headOffice.apiKeyEnc) {
    throw new Error(
      `Branch ${branch.id} has no KCB Buni credentials and no head office fallback is configured`,
    );
  }
  return headOffice;
}

/** Short origin tag (e.g. "ELD") folded into the KCB invoice/account number so
 * head office can tell, from the KCB Buni portal alone, which branch a
 * paybill-fallback payment actually belongs to. */
export function originBranchTag(branch: { name: string | null; county: string | null }): string {
  const source = branch.name || branch.county || "BR";
  return source.split(" ")[0].slice(0, 3).toUpperCase();
}
