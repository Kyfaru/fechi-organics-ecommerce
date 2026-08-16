import { SITE_URL } from "@/lib/site";
import { emailShell, emailSection, EMAIL_BRAND, FONT_HEADING } from "@/lib/email-template";

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || "there";
}

/** Plain-text message body, used for SMS and inbox sends. */
export function buildContactMessage(args: {
  greeting: string;
  customerName: string | null;
  body: string;
  branchPhone?: string | null;
  ctaLink?: string;
}): string {
  const signature = [`— The Fechi Organics Team`, args.ctaLink ?? `${SITE_URL}/contact`];
  if (args.branchPhone) signature.push(args.branchPhone);
  return `${args.greeting} ${firstName(args.customerName)},\n\n${args.body.trim()}\n\n${signature.join("\n")}`;
}

/** Same message, wrapped in the shared branded email shell. */
export function buildContactEmailHtml(args: {
  greeting: string;
  customerName: string | null;
  body: string;
  branchPhone?: string | null;
  orderRef: string;
  ctaLink?: string;
}): string {
  const paragraphs = args.body
    .trim()
    .split(/\n+/)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">${p}</p>`)
    .join("");

  const link = args.ctaLink ?? `${SITE_URL}/contact`;

  const sections = [
    emailSection(`
      <h1 style="margin:0 0 16px;font-family:${FONT_HEADING};font-size:22px;font-weight:700;color:${EMAIL_BRAND.textDark};">Order ${args.orderRef}</h1>
      <p style="margin:0 0 16px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">${args.greeting} ${firstName(args.customerName)},</p>
      ${paragraphs}
      <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_BRAND.textMuted};line-height:1.6;">
        — The Fechi Organics Team<br/>
        <a href="${link}" style="color:${EMAIL_BRAND.darkGreen};text-decoration:underline;">${link.replace(/^https?:\/\//, "")}</a>
        ${args.branchPhone ? `<br/>${args.branchPhone}` : ""}
      </p>
    `),
  ].join("");

  return emailShell({ title: `Order ${args.orderRef}`, sectionsHtml: sections });
}
