import { Resend } from "resend";
import { SITE_URL } from "@/lib/site";
import {
  emailShell,
  emailSection,
  emailButton,
  emailInfoBox,
  emailDivider,
  emailIconCircle,
  EMAIL_BRAND,
  FONT_HEADING,
} from "@/lib/email-template";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
const sendEmail = process.env.EMAIL_FROM

export async function sendOTPEmail(email: string, otp: string, type: string): Promise<void> {
  const subject =
    type === "sign-in"
      ? "Your Fechi Organics login code"
      : type === "email-verification"
      ? "Verify your Fechi Organics email"
      : type === "password-reset"
      ? "Your Fechi Organics password reset code"
      : "Your Fechi Organics verification code";

  const { error } = await getResend().emails.send({
    from: sendEmail!,
    to: email,
    subject,
    html: buildOTPEmailHTML(otp, type),
  });

  if (error) {
    console.error("[Resend] Failed to send OTP email:", error);
    throw new Error("Failed to send verification email");
  }
}

/**
 * Sends a password-reset email containing a magic-link button.
 *
 * @param email    - Recipient email address.
 * @param resetUrl - The full reset URL including the signed JWT token.
 * @throws When Resend fails to deliver the email.
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: sendEmail!,
    to: email,
    subject: "Reset your Fechi Organics password",
    html: buildPasswordResetEmailHTML(resetUrl),
  });
  if (error) {
    console.error("[Resend] Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}

/**
 * Sends the post-signup welcome email. Best-effort — failures are logged and
 * swallowed by the caller (lib/auth.ts's user.create hook) rather than
 * blocking account creation.
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const { error } = await getResend().emails.send({
    from: sendEmail!,
    to: email,
    subject: "Welcome to Fechi Organics",
    html: buildWelcomeEmailHTML(name),
  });
  if (error) {
    console.error("[Resend] Failed to send welcome email:", error);
    throw new Error("Failed to send welcome email");
  }
}

export async function sendOrderConfirmationEmail(args: {
  email: string;
  orderId: string;
  html: string;
  pdfBuffer?: Buffer;
}): Promise<void> {
  const { error } = await getResend().emails.send({
    from: sendEmail!,
    to: args.email,
    subject: `Your Fechi Organics receipt #${args.orderId.slice(0, 8).toUpperCase()}`,
    html: args.html,
    attachments: args.pdfBuffer
      ? [{ filename: `fechi-receipt-${args.orderId.slice(0, 8)}.pdf`, content: args.pdfBuffer }]
      : undefined,
  });

  if (error) {
    console.error("[Resend] Failed to send order confirmation:", error);
    throw new Error("Failed to send order confirmation email");
  }
}

export async function sendInvoiceEmail(args: {
  email: string;
  orderId: string;
  invoiceNumber: string;
  html: string;
  pdfBuffer: Buffer;
}): Promise<void> {
  const { error } = await getResend().emails.send({
    from: sendEmail!,
    to: args.email,
    subject: `Your Fechi Organics invoice ${args.invoiceNumber}`,
    html: args.html,
    attachments: [{ filename: `fechi-invoice-${args.invoiceNumber}.pdf`, content: args.pdfBuffer }],
  });

  if (error) {
    console.error("[Resend] Failed to send invoice email:", error);
    throw new Error("Failed to send invoice email");
  }
}

export async function sendAdminNotificationEmail(args: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  const { error } = await getResend().emails.send({
    from: sendEmail!,
    to: args.to,
    subject: args.subject,
    html: args.html,
  });
  if (error) {
    console.error("[Resend] Failed to send admin notification:", error);
    throw new Error("Failed to send admin notification");
  }
}

/**
 * Sends a branded acknowledgment email after a contact-form submission turns
 * into a support ticket (matched-account submitters only — see
 * app/api/contact/route.ts). Confirms receipt and sets a response-time
 * expectation so the customer isn't left wondering whether the message went
 * through.
 *
 * @param args.email        - Recipient email address.
 * @param args.name         - Recipient display name.
 * @param args.ticketNumber - The newly created ticket's customer-facing number.
 * @param args.subject      - The subject the customer submitted.
 * @throws When Resend fails to deliver the email.
 */
export async function sendTicketAcknowledgmentEmail(args: {
  email: string;
  name: string;
  ticketNumber: string;
  subject: string;
}): Promise<void> {
  const { error } = await getResend().emails.send({
    from: sendEmail!,
    to: args.email,
    subject: `We've received your message — Ticket ${args.ticketNumber}`,
    html: buildTicketAcknowledgmentEmailHTML(args),
  });

  if (error) {
    console.error("[Resend] Failed to send ticket acknowledgment email:", error);
    throw new Error("Failed to send ticket acknowledgment email");
  }
}

function buildTicketAcknowledgmentEmailHTML(args: {
  name: string;
  ticketNumber: string;
  subject: string;
}): string {
  const sections = [
    emailSection(`
      ${emailIconCircle("check")}
      <h1 style="margin:0 0 16px;text-align:center;font-family:${FONT_HEADING};font-size:26px;font-weight:700;color:${EMAIL_BRAND.textDark};">We've Got Your Message</h1>
      <p style="margin:0 0 16px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">
        Hi ${args.name.split(" ")[0] || args.name},
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;">
        Thanks for reaching out about <strong>${args.subject}</strong>. We've opened a support
        ticket so we can track it through to a resolution — your ticket number is
        <strong>${args.ticketNumber}</strong>.
      </p>
      ${emailInfoBox("Our team typically responds within <strong>24 hours</strong> on business days.", "success")}
      <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_BRAND.textMuted};line-height:1.6;">
        You can follow the conversation any time from your
        <a href="${SITE_URL}/account/messages" style="color:${EMAIL_BRAND.darkGreen};text-decoration:underline;">messages inbox</a>.
      </p>
    `),
  ].join("");

  return emailShell({ title: "We've received your message", sectionsHtml: sections });
}

function buildPasswordResetEmailHTML(resetUrl: string): string {
  const sections = [
    emailSection(`
      ${emailIconCircle("lock")}
      <h1 style="margin:0 0 16px;text-align:center;font-family:${FONT_HEADING};font-size:26px;font-weight:700;color:${EMAIL_BRAND.textDark};">Password Reset</h1>
      <p style="font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;margin:0 0 32px;text-align:center;">
        Click the button below to reset your password. This link expires in <strong>1 hour</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td>${emailButton("Reset Password", resetUrl)}</td></tr></table>
      <p style="font-size:12px;color:${EMAIL_BRAND.textMuted};margin:32px 0 0;text-align:center;">
        If you didn't request this, you can safely ignore this email.
      </p>
    `, "48px 48px 40px"),
  ].join("");

  return emailShell({ title: "Reset Your Password", sectionsHtml: sections });
}

function buildWelcomeEmailHTML(name: string): string {
  const firstName = name.split(" ")[0] || name;
  const sections = [
    emailSection(`
      ${emailIconCircle("gift")}
      <h1 style="margin:0 0 20px;text-align:center;font-family:${FONT_HEADING};font-size:26px;font-weight:700;color:${EMAIL_BRAND.textDark};">Welcome to the Family</h1>
      <p style="margin:0 0 16px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.7;">Hi ${firstName},</p>
      <p style="margin:0 0 16px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.7;">
        We're so glad you're here. You've just taken a step towards a more natural, radiant you —
        and we're honored to be part of that journey.
      </p>
      <p style="margin:0 0 28px;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.7;">
        Rooted in botanical heritage and formulated with care, every Fechi Organics product is made
        to nourish, protect, and celebrate your natural skin.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td>${emailButton("Start Shopping", SITE_URL)}</td></tr></table>
    `),
  ].join("");

  return emailShell({ title: "Welcome to Fechi Organics", sectionsHtml: sections });
}

function buildOTPEmailHTML(otp: string, type: string): string {
  const digits = otp.split("").map(d => `
    <td style="width:52px;height:60px;background:#f9f9f9;border:2px solid #c0cab8;border-radius:12px;text-align:center;vertical-align:middle;font-family:${FONT_HEADING};font-size:28px;font-weight:700;color:${EMAIL_BRAND.textDark};letter-spacing:0;">
      ${d}
    </td>
    <td style="width:10px;"></td>
  `).join("");

  const action =
    type === "sign-in" ? "signing in" :
    type === "email-verification" ? "verifying your email" :
    "completing your request";

  const sections = [
    emailSection(`
      ${emailIconCircle("lock")}
      <h1 style="margin:0 0 8px;text-align:center;font-family:${FONT_HEADING};font-size:26px;font-weight:700;color:${EMAIL_BRAND.textDark};letter-spacing:-0.5px;">Verification Code</h1>
      <p style="margin:12px 0 0;font-size:15px;color:${EMAIL_BRAND.textBody};line-height:1.6;text-align:center;">
        Use the code below for ${action}. It expires in <strong>5 minutes</strong> and can only be used once.
      </p>

      <table cellpadding="0" cellspacing="0" style="margin:36px auto;border-collapse:separate;border-spacing:0;">
        <tr>${digits}</tr>
      </table>

      ${emailDivider()}

      ${emailInfoBox("<strong>Never share this code.</strong> Fechi Organics will never ask for it by phone or chat. If you didn't request this, you can safely ignore this email.", "warning")}

      <p style="margin:28px 0 0;font-size:13px;color:${EMAIL_BRAND.textMuted};line-height:1.6;text-align:center;">
        Trouble signing in? Reply to this email or visit our
        <a href="${SITE_URL}/help" style="color:${EMAIL_BRAND.darkGreen};text-decoration:underline;">help center</a>.
      </p>
    `),
  ].join("");

  return emailShell({ title: "Fechi Organics — Verification Code", sectionsHtml: sections });
}
