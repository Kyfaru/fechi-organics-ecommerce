import { SITE_URL } from "@/lib/site";

/**
 * Shared visual chrome for every outbound HTML email — header logo, card,
 * footer, buttons, icon badges. Centralized because every sender used to
 * duplicate this markup independently (14+ copies, three different greens).
 *
 * Email clients strip <script>, ignore Tailwind/CDN styles, and don't load
 * icon fonts reliably, so this can't just reuse the site's Tailwind classes —
 * everything here is table layout + inline styles + inline SVG, the
 * "bulletproof HTML email" approach.
 */

export const EMAIL_BRAND = {
  primaryGreen: "#27731e",
  darkGreen: "#045a03",
  yellowCta: "#fec700",
  mint: "#a4f690",
  mintLight: "#e8fce3",
  danger: "#D64545",
  dangerBg: "#FBEDED",
  success: "#166534",
  successBg: "#f0fdf4",
  successBorder: "#bbf7d0",
  warning: "#92400e",
  warningBg: "#fffbeb",
  warningBorder: "#fcd34d",
  textDark: "#1a1c1c",
  textBody: "#40493c",
  textMuted: "rgba(64,73,60,0.6)",
  pageBg: "#f4f6f3",
  divider: "#e8ede6",
  logoUrl: `${SITE_URL}/logo/email-logo-white.png`,
} as const;

// Syne (headings) + DM Sans (body) are the site's actual brand fonts
// (app/layout.tsx) and are both hosted on Google Fonts, so they render in
// clients that support remote @import/<link> fonts (Apple Mail, Gmail web/app,
// Outlook.com) and fall back cleanly to the sans-serif stack elsewhere.
const FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>';
export const FONT_HEADING = "'Syne','DM Sans',Helvetica,Arial,sans-serif";
export const FONT_BODY = "'DM Sans',Helvetica,Arial,sans-serif";

/** Wraps section HTML (a series of `<tr><td>` blocks) in the logo header / card / footer shell. */
export function emailShell(opts: { title: string; previewText?: string; sectionsHtml: string }): string {
  const { title, previewText, sectionsHtml } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${title}</title>
${FONT_LINK}
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_BRAND.pageBg};font-family:${FONT_BODY};">
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${previewText}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BRAND.pageBg};padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:${EMAIL_BRAND.primaryGreen};padding:32px 48px;text-align:center;">
            <img src="${EMAIL_BRAND.logoUrl}" width="140" alt="Fechi Organics" style="display:block;margin:0 auto;border:0;outline:none;max-width:140px;"/>
          </td>
        </tr>
${sectionsHtml}
        <tr>
          <td style="background:${EMAIL_BRAND.pageBg};padding:24px 48px;border-top:1px solid ${EMAIL_BRAND.divider};text-align:center;">
            <p style="margin:0;font-size:12px;color:${EMAIL_BRAND.textMuted};line-height:1.5;">
              © ${new Date().getFullYear()} Fechi Organics. All rights reserved.<br/>
              Rooted in Nature. Formulated for You.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** A `<tr><td>` content section with the shell's standard padding. */
export function emailSection(innerHtml: string, padding = "40px 48px"): string {
  return `<tr><td style="padding:${padding};">${innerHtml}</td></tr>`;
}

export function emailButton(label: string, href: string, variant: "primary" | "outline" = "primary"): string {
  const isPrimary = variant === "primary";
  const bg = isPrimary ? EMAIL_BRAND.primaryGreen : "transparent";
  const color = isPrimary ? "#ffffff" : EMAIL_BRAND.primaryGreen;
  const border = isPrimary ? "none" : `2px solid ${EMAIL_BRAND.primaryGreen}`;
  return `<a href="${href}" style="display:inline-block;background:${bg};color:${color};border:${border};padding:14px 32px;border-radius:40px;font-family:${FONT_BODY};font-size:15px;font-weight:700;text-decoration:none;">${label}</a>`;
}

const TONE_STYLES = {
  warning: { bg: EMAIL_BRAND.warningBg, border: EMAIL_BRAND.warningBorder, text: EMAIL_BRAND.warning },
  success: { bg: EMAIL_BRAND.successBg, border: EMAIL_BRAND.successBorder, text: EMAIL_BRAND.success },
  danger: { bg: EMAIL_BRAND.dangerBg, border: "#f3b7b7", text: "#8a2b2b" },
  info: { bg: EMAIL_BRAND.mintLight, border: "#bfe8b0", text: EMAIL_BRAND.darkGreen },
} as const;

export function emailInfoBox(innerHtml: string, tone: keyof typeof TONE_STYLES = "info"): string {
  const s = TONE_STYLES[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${s.bg};border:1px solid ${s.border};border-radius:12px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0;font-size:13px;color:${s.text};line-height:1.5;">${innerHtml}</p>
    </td></tr>
  </table>`;
}

export function emailDivider(): string {
  return `<hr style="border:none;border-top:1px solid ${EMAIL_BRAND.divider};margin:32px 0;"/>`;
}

/** 24x24 viewBox path data for the small inline-SVG icon badges below — no icon fonts (they don't render in email). */
const ICON_PATHS = {
  lock: '<path d="M6 11V8a6 6 0 1112 0v3M5 11h14a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  gift: '<path d="M20 12v9H4v-9M2 7h20v5H2V7zM12 22V7M12 7C10 3 6 3 6 6c0 2 3 1 6 1zM12 7c2-4 6-4 6-1 0 2-3 1-6 1z"/>',
  receipt:
    '<path d="M4 3h16v18l-3-2-3 2-3-2-3 2-3-2-1 2V3z"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  chart: '<path d="M3 3v18h18M8 17V9M13 17V5M18 17v-7"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>',
} as const;

/** One row of a receipt/invoice line-item list: name (+ optional qty) on the left, amount on the right. */
export function emailLineItem(label: string, amount?: string, meta?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${EMAIL_BRAND.divider};">
    <tr>
      <td style="padding:12px 0;font-size:14px;color:${EMAIL_BRAND.textDark};">${label}${meta ? `<br/><span style="font-size:12px;color:${EMAIL_BRAND.textMuted};">${meta}</span>` : ""}</td>
      ${amount ? `<td style="padding:12px 0;font-size:14px;color:${EMAIL_BRAND.textDark};text-align:right;white-space:nowrap;">${amount}</td>` : ""}
    </tr>
  </table>`;
}

/** A label/value row for totals blocks — pass `emphasize` for the grand-total row. */
export function emailTotalRow(label: string, value: string, emphasize = false): string {
  const size = emphasize ? "16px" : "13px";
  const weight = emphasize ? "700" : "400";
  const color = emphasize ? EMAIL_BRAND.textDark : EMAIL_BRAND.textMuted;
  const border = emphasize ? `border-top:1px solid ${EMAIL_BRAND.divider};padding-top:10px;margin-top:6px;` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${border}">
    <tr>
      <td style="font-size:${size};font-weight:${weight};color:${color};padding:4px 0;">${label}</td>
      <td style="font-size:${size};font-weight:${weight};color:${color};padding:4px 0;text-align:right;">${value}</td>
    </tr>
  </table>`;
}

export function emailIconCircle(icon: keyof typeof ICON_PATHS, opts?: { size?: number; bg?: string; fg?: string }): string {
  const size = opts?.size ?? 64;
  const bg = opts?.bg ?? EMAIL_BRAND.mintLight;
  const fg = opts?.fg ?? EMAIL_BRAND.primaryGreen;
  const iconSize = Math.round(size * 0.42);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td align="center" valign="middle" style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};">
    <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[icon]}</svg>
  </td></tr></table>`;
}
