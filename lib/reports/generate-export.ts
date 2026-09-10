import type { ExportFilters } from "@/lib/reports/types";
import { fetchOrdersReportRows } from "@/lib/reports/orders-rows";
import { fetchFinanceReportRows } from "@/lib/reports/finance-rows";
import { renderCsv } from "@/lib/reports/render-csv";
import { renderXml } from "@/lib/reports/render-xml";
import { renderExportReportPdf } from "@/lib/pdf/ExportReportDocument";

// Single entry point, called from both the fast admin/super_admin path
// (app/api/admin/{orders,finance}/export/route.ts) and the approval-executor
// path (lib/approval-executors.ts's "orders:export"/"finance:export") — same
// function, two callers, matching this codebase's existing
// approval-executors convention where every executor mirrors what its
// fast-path route already does.
export async function generateExportFile(
  resource: "orders" | "finance",
  filters: ExportFilters,
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const data = resource === "orders" ? await fetchOrdersReportRows(filters) : await fetchFinanceReportRows(filters);
  const stamp = new Date().toISOString().slice(0, 10);
  const title = resource === "orders" ? "Fechi Organics — Orders Report" : "Fechi Organics — Finance Report";

  if (filters.format === "csv") {
    return { buffer: Buffer.from(renderCsv(data), "utf-8"), fileName: `${resource}-report-${stamp}.csv`, contentType: "text/csv; charset=utf-8" };
  }
  if (filters.format === "xml") {
    return { buffer: Buffer.from(renderXml(data), "utf-8"), fileName: `${resource}-report-${stamp}.xml`, contentType: "application/xml; charset=utf-8" };
  }
  return {
    buffer: await renderExportReportPdf(data, { title, resource }),
    fileName: `${resource}-report-${stamp}.pdf`,
    contentType: "application/pdf",
  };
}
