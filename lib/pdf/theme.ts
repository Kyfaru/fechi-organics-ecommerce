// Shared jsPDF color/layout constants — promoted out of InvoiceDocument.ts so
// every generated PDF (invoices, and the newer audit-grade export reports)
// stays visually consistent instead of drifting into near-duplicate palettes.
export const GREEN: [number, number, number] = [39, 115, 30]; // #27731e
export const GOLD: [number, number, number] = [254, 199, 0]; // #fec700
export const GRAY_LINE: [number, number, number] = [183, 183, 183]; // #B7B7B7
export const TEXT_DARK: [number, number, number] = [40, 40, 40];
export const TEXT_MUTED: [number, number, number] = [130, 130, 130];
export const STRIPE_TINT: [number, number, number] = [240, 247, 240];

export const MARGIN_X = 15;
export const PAGE_WIDTH = 210; // A4, mm
export const PAGE_HEIGHT = 297;
export const CONTENT_RIGHT = PAGE_WIDTH - MARGIN_X;

export function kes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

export function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(date: Date): string {
  return date.toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Real, official company contact details (also used on the public Contact
// page) — reused in report footers instead of placeholder text.
export const COMPANY_PHONE = "+254 768 151 505";
export const COMPANY_EMAIL = "fechiorganicsltd@gmail.com";
export const COMPANY_FOOTNOTE = "5 branches across Kenya — Nairobi, Nakuru, Eldoret, Mwea & Kitengela";
