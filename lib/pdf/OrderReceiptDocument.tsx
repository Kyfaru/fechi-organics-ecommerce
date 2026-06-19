type ReceiptOrder = {
  id: string;
  createdAt: Date;
  subtotalKes: number;
  deliveryKes: number;
  discountKes: number;
  totalKes: number;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryCounty?: string | null;
  deliveryZone?: string | null;
  items: { name: string; quantity: number; priceKes: number }[];
};

function kes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildReceiptSummaryHtml(order: ReceiptOrder) {
  const rows = order.items
    .map((item) => `<tr><td style="padding:8px 0;">${item.name} x ${item.quantity}</td><td style="padding:8px 0;text-align:right;">${kes(item.priceKes * item.quantity)}</td></tr>`)
    .join("");
  return `
    <div style="font-family:Arial,sans-serif;color:#1a1c1c;">
      <h2 style="color:#27731e;">Fechi Organics Receipt</h2>
      <p>Order #${order.id.slice(0, 8).toUpperCase()} placed on ${order.createdAt.toLocaleString("en-KE")}.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <hr style="border:none;border-top:1px solid #e2e2e2;margin:16px 0;"/>
      <p>Subtotal: <strong>${kes(order.subtotalKes)}</strong></p>
      <p>Delivery: <strong>${order.deliveryKes ? kes(order.deliveryKes) : "Free"}</strong></p>
      ${order.discountKes ? `<p>Discount: <strong>-${kes(order.discountKes)}</strong></p>` : ""}
      <p>Total Paid: <strong>${kes(order.totalKes)}</strong></p>
      <p>Delivery: ${[order.deliveryZone, order.deliveryAddress, order.deliveryCity, order.deliveryCounty].filter(Boolean).join(", ")}</p>
    </div>
  `;
}

export function renderReceiptPdfBuffer(order: ReceiptOrder) {
  const lines = [
    "FECHI ORGANICS",
    `Receipt for order ${order.id}`,
    `Date: ${order.createdAt.toLocaleString("en-KE")}`,
    "",
    ...order.items.map((item) => `${item.name} x ${item.quantity} - ${kes(item.priceKes * item.quantity)}`),
    "",
    `Subtotal: ${kes(order.subtotalKes)}`,
    `Delivery: ${order.deliveryKes ? kes(order.deliveryKes) : "Free"}`,
    `Discount: ${order.discountKes ? `-${kes(order.discountKes)}` : "KES 0"}`,
    `Total Paid: ${kes(order.totalKes)}`,
    "",
    "Thank you for shopping with Fechi Organics.",
  ];
  const text = lines.map(pdfEscape).join("\\n");
  const stream = `BT /F1 12 Tf 48 780 Td 14 TL (${text}) Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];
  const body = objects.join("\n");
  return Buffer.from(`%PDF-1.4\n${body}\ntrailer << /Root 1 0 R >>\n%%EOF`);
}
