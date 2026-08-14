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
  lock: '<path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M2 16c0-2.828 0-4.243.879-5.121C3.757 10 5.172 10 8 10h8c2.828 0 4.243 0 5.121.879C22 11.757 22 13.172 22 16s0 4.243-.879 5.121C20.243 22 18.828 22 16 22H8c-2.828 0-4.243 0-5.121-.879C2 20.243 2 18.828 2 16" opacity=".5" /><path fill="currentColor" d="M6.75 8a5.25 5.25 0 0 1 10.5 0v2.004c.567.005 1.064.018 1.5.05V8a6.75 6.75 0 0 0-13.5 0v2.055a24 24 0 0 1 1.5-.051z" />',
  check: '<path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m6 13.626l1.606 1.722c.886.95 1.329 1.424 1.825 1.574c.436.131.9.096 1.315-.1c.473-.224.852-.761 1.612-1.836L18 7" />',
  gift: '<path d="M0 0h24v24H0z" fill="none" /><g fill="none"><path fill="currentColor" d="M4 19v-7h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2" opacity=".16" /><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 12v8m-8-9v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path stroke="currentColor" stroke-linejoin="round" stroke-width="2" d="M6 4.5A2.5 2.5 0 0 1 8.5 2A3.5 3.5 0 0 1 12 5.5V7H8.5A2.5 2.5 0 0 1 6 4.5Zm12 0A2.5 2.5 0 0 0 15.5 2A3.5 3.5 0 0 0 12 5.5V7h3.5A2.5 2.5 0 0 0 18 4.5Z" /><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18v4H3zm9 4v10" /></g>',
  receipt:'<path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M24 1.24a1 1 0 0 0-1-1H10.58c-1.36 0-2 1.27-2 2.47A98 98 0 0 1 7.7 16a.25.25 0 0 1-.24.21h-3c-2 0-2.22 2.07-2.34 3.3C2 21.48 1.73 21.75 1 21.75a1 1 0 1 0 0 2h11.5c2.38 0 2.72-2.36 2.92-3.76c.17-1.18.3-1.74.58-1.74h.41a.25.25 0 0 1 .24.17c.06.19.12.45.16.64c.2.94.56 2.69 2.69 2.69c4.07 0 4.5-11.54 4.5-16.48zM12.06 13.5a.75.75 0 0 1 0-1.5h6a.75.75 0 0 1 0 1.5Zm-.25-8.75a.75.75 0 0 1 .75-.75h2a.75.75 0 1 1 0 1.5h-2a.75.75 0 0 1-.75-.75m6.75 4.75h-5.75a.75.75 0 0 1 0-1.5h5.75a.75.75 0 0 1 0 1.5m-5.13 10.2c-.25 1.77-.45 2.05-.94 2.05H4.11a.28.28 0 0 1-.2-.1a.26.26 0 0 1 0-.21a10.3 10.3 0 0 0 .27-1.69a4.6 4.6 0 0 1 .28-1.49h9a.25.25 0 0 1 .24.31c-.16.43-.22.78-.27 1.13" />',
  chart: '<path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" fill-rule="evenodd" d="M14 20.5V4.25c0-.728-.002-1.2-.048-1.546c-.044-.325-.115-.427-.172-.484s-.159-.128-.484-.172C12.949 2.002 12.478 2 11.75 2s-1.2.002-1.546.048c-.325.044-.427.115-.484.172s-.128.159-.172.484c-.046.347-.048.818-.048 1.546V20.5z" clip-rule="evenodd" /><path fill="currentColor" d="M8 8.75A.75.75 0 0 0 7.25 8h-3a.75.75 0 0 0-.75.75V20.5H8zm12 5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75v6.75H20z" opacity=".7" /><path fill="currentColor" d="M1.75 20.5a.75.75 0 0 0 0 1.5h20a.75.75 0 0 0 0-1.5z" opacity=".5" />',
  alert: '<path d="M0 0h24v24H0z" fill="none" /><g fill="none"><path fill="currentColor" fill-opacity=".16" d="M10.575 5.217L3.517 17a1.667 1.667 0 0 0 1.425 2.5h14.116a1.666 1.666 0 0 0 1.425-2.5L13.426 5.217a1.666 1.666 0 0 0-2.85 0" /><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M12 16h.008M12 10v3m-1.425-7.783L3.517 17a1.667 1.667 0 0 0 1.425 2.5h14.116a1.666 1.666 0 0 0 1.425-2.5L13.426 5.217a1.666 1.666 0 0 0-2.85 0" /></g>',
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
