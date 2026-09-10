/**
 * POST /api/admin/orders/export — customize-filters export for the Orders
 * page. See lib/reports/export-route-handler.ts for the shared flow (also
 * used by Finance's export route) and lib/reports/orders-rows.ts for the
 * row-fetch/shape logic.
 */
import { NextRequest, connection } from "next/server";
import { handleExportRequest } from "@/lib/reports/export-route-handler";

export async function POST(req: NextRequest) {
  await connection();
  return handleExportRequest(req, "orders");
}
