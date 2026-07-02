import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type InvoiceOrder = {
  id: string;
  orderNumber: string | null;
  invoiceNumber: string;
  createdAt: Date;
  subtotalKes: number;
  deliveryKes: number;
  discountKes: number;
  totalKes: number;
  deliveryType: string;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryCounty?: string | null;
  items: { name: string; quantity: number; priceKes: number }[];
  user?: { name: string; email: string } | null;
  guestEmail?: string | null;
  branch?: { name: string; county: string; address: string | null } | null;
  transactions: {
    provider: string;
    status: string;
    mpesaReceiptNumber?: string | null;
    updatedAt: Date;
  }[];
};

const GREEN: [number, number, number] = [39, 115, 30]; // #27731e
const GOLD: [number, number, number] = [254, 199, 0]; // #fec700
const GRAY_LINE: [number, number, number] = [183, 183, 183]; // #B7B7B7
const TEXT_DARK: [number, number, number] = [40, 40, 40];
const TEXT_MUTED: [number, number, number] = [130, 130, 130];
const STRIPE_TINT: [number, number, number] = [240, 247, 240];

const MARGIN_X = 15;
const PAGE_WIDTH = 210;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN_X;

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  MPESA: "M-Pesa",
  PAYSTACK: "Paystack",
  KCB: "KCB",
};

function paymentMethodLine(order: InvoiceOrder): string {
  const tx = order.transactions.find((t) => t.status === "SUCCESS") ?? order.transactions[0];
  if (!tx) return "Paid";
  const provider = PROVIDER_LABELS[tx.provider] ?? tx.provider;
  return tx.mpesaReceiptNumber
    ? `Paid via ${provider} — Receipt ${tx.mpesaReceiptNumber}`
    : `Paid via ${provider}`;
}

function paidDate(order: InvoiceOrder): Date {
  const tx = order.transactions.find((t) => t.status === "SUCCESS") ?? order.transactions[0];
  return tx?.updatedAt ?? order.createdAt;
}

function fmtDate(date: Date) {
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export function renderInvoicePdfBuffer(order: InvoiceOrder): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  // ---- Header: title + PAID badge --------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...GREEN);
  doc.text("INVOICE", MARGIN_X, 24);

  doc.setFillColor(...GREEN);
  doc.roundedRect(CONTENT_RIGHT - 24, 12, 24, 7, 1.5, 1.5, "F");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("PAID", CONTENT_RIGHT - 12, 16.7, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...TEXT_DARK);
  doc.text(kes(order.totalKes), CONTENT_RIGHT, 26, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Paid on ${fmtDate(paidDate(order))}`, CONTENT_RIGHT, 31, { align: "right" });

  // ---- Business (sender) block ------------------------------------------
  let y = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text("FECHI ORGANICS", MARGIN_X, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT_MUTED);
  const branchAddress = order.branch?.address ?? (order.branch ? `${order.branch.name}, ${order.branch.county}` : null);
  const senderLines = [branchAddress, order.branch?.county, "Kenya"].filter(Boolean) as string[];
  senderLines.forEach((line, i) => doc.text(line, MARGIN_X, y + 5.5 + i * 5));

  y += 5.5 + senderLines.length * 5 + 4;
  doc.setDrawColor(...GRAY_LINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, y, CONTENT_RIGHT, y);
  y += 10;

  // ---- Bill To / Invoice meta --------------------------------------------
  const customerName = order.user?.name ?? "Customer";
  const customerEmail = order.user?.email ?? order.guestEmail ?? "";
  const isPickup = order.deliveryType === "PICKUP";
  const billLines = isPickup
    ? [`Store Pickup — ${order.branch?.name ?? "Fechi Organics"}`]
    : [order.deliveryAddress, [order.deliveryCity, order.deliveryCounty].filter(Boolean).join(", ")].filter(Boolean) as string[];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("BILL TO", MARGIN_X, y);
  doc.text("INVOICE #", CONTENT_RIGHT - 60, y);
  doc.text("DATE", CONTENT_RIGHT - 30, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text(customerName, MARGIN_X, y + 5.5);
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(customerEmail, MARGIN_X, y + 10.5);
  billLines.forEach((line, i) => doc.text(line, MARGIN_X, y + 15.5 + i * 5));

  doc.setFontSize(10.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text(order.invoiceNumber, CONTENT_RIGHT - 60, y + 5.5);
  doc.text(fmtDate(order.createdAt), CONTENT_RIGHT - 30, y + 5.5);

  y += 15.5 + billLines.length * 5 + 8;

  // ---- Items table --------------------------------------------------------
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Description", "Qty", "Price", "Amount"]],
    body: order.items.map((item) => [
      item.name,
      String(item.quantity),
      kes(item.priceKes),
      kes(item.priceKes * item.quantity),
    ]),
    styles: { font: "helvetica", fontSize: 9.5, textColor: TEXT_DARK, cellPadding: 3 },
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: STRIPE_TINT },
    columnStyles: {
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 35 },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursorY = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 10;

  // ---- Totals block ---------------------------------------------------------
  const totalsX = CONTENT_RIGHT - 65;
  const valueX = CONTENT_RIGHT;
  const totalsRows: [string, string][] = [
    ["Sub-total", kes(order.subtotalKes)],
    ["Delivery", order.deliveryKes ? kes(order.deliveryKes) : "Free"],
  ];
  if (order.discountKes) totalsRows.push(["Discount", `-${kes(order.discountKes)}`]);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  totalsRows.forEach(([label, value]) => {
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label, totalsX, cursorY);
    doc.setTextColor(...TEXT_DARK);
    doc.text(value, valueX, cursorY, { align: "right" });
    cursorY += 6;
  });

  doc.setDrawColor(...GRAY_LINE);
  doc.line(totalsX, cursorY, valueX, cursorY);
  cursorY += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...GREEN);
  doc.text("TOTAL", totalsX, cursorY);
  doc.text(kes(order.totalKes), valueX, cursorY, { align: "right" });
  cursorY += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(paymentMethodLine(order), valueX, cursorY, { align: "right" });

  // ---- Footer ---------------------------------------------------------------
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_X, pageHeight - 22, CONTENT_RIGHT, pageHeight - 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    "Thank you for shopping with Fechi Organics. This invoice is issued under the terms and agreement of Fechi Organics.",
    PAGE_WIDTH / 2,
    pageHeight - 15,
    { align: "center" },
  );

  return Buffer.from(doc.output("arraybuffer"));
}
