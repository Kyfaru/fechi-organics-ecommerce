/**
 * POST /api/admin/finance/export — customize-filters export for the Finance
 * page. Replaces the old CSV-only, unfiltered, transaction-level export
 * (same three bugs as the Total Revenue stat card — see
 * app/api/admin/transactions/route.ts for the fix history) with the shared
 * PDF/CSV/XML report pipeline. See lib/reports/export-route-handler.ts for
 * the shared flow and lib/reports/finance-rows.ts for the row-fetch logic
 * (PAID-only, order-level, combined online + in-store).
 */
import { NextRequest, connection } from "next/server";
import { handleExportRequest } from "@/lib/reports/export-route-handler";

export async function POST(req: NextRequest) {
  await connection();
  return handleExportRequest(req, "finance");
}
