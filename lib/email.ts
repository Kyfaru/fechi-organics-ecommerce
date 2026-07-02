import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const sendEmail = process.env.EMAIL_FROM

export async function sendOTPEmail(email: string, otp: string, type: string): Promise<void> {
  const subject =
    type === "sign-in"
      ? "Your Fechi Organics login code"
      : type === "email-verification"
      ? "Verify your Fechi Organics email"
      : "Your Fechi Organics verification code";

  const { error } = await resend.emails.send({
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
  const { error } = await resend.emails.send({
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

export async function sendOrderConfirmationEmail(args: {
  email: string;
  orderId: string;
  html: string;
  pdfBuffer?: Buffer;
}): Promise<void> {
  const { error } = await resend.emails.send({
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
  const { error } = await resend.emails.send({
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
  const { error } = await resend.emails.send({
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

function buildPasswordResetEmailHTML(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Reset Your Password</title></head>
<body style="margin:0;padding:0;background-color:#f4f6f3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
        <tr>
          <td style="background:#27731e;padding:40px 48px 36px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Fechi Organics</p>
            <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#ffffff;">Password Reset</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:48px 48px 40px;text-align:center;">
            <p style="font-size:15px;color:#40493c;line-height:1.6;margin-bottom:32px;">
              Click the button below to reset your password. This link expires in <strong>1 hour</strong>.
            </p>
            <a href="${resetUrl}" style="display:inline-block;background:#27731e;color:#ffffff;padding:14px 32px;border-radius:40px;font-size:15px;font-weight:700;text-decoration:none;">
              Reset Password
            </a>
            <p style="font-size:12px;color:#a0a0a0;margin-top:32px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildOTPEmailHTML(otp: string, type: string): string {
  const digits = otp.split("").map(d => `
    <td style="width:52px;height:60px;background:#f9f9f9;border:2px solid #c0cab8;border-radius:12px;text-align:center;vertical-align:middle;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#1a1c1c;letter-spacing:0;">
      ${d}
    </td>
    <td style="width:10px;"></td>
  `).join("");

  const action =
    type === "sign-in" ? "signing in" :
    type === "email-verification" ? "verifying your email" :
    "completing your request";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fechi Organics — Verification Code</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background:#27731e;padding:40px 48px 36px;text-align:center;">
              <!-- Leaf SVG symbol -->
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 16px;">
                <circle cx="24" cy="24" r="24" fill="rgba(255,255,255,0.15)"/>
                <path d="M24 10C24 10 14 16 14 26C14 31.523 18.477 36 24 36C29.523 36 34 31.523 34 26C34 16 24 10 24 10Z" fill="#a4f690"/>
                <path d="M24 18V36" stroke="#27731e" stroke-width="2" stroke-linecap="round"/>
                <path d="M24 24L20 20" stroke="#27731e" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M24 28L28 24" stroke="#27731e" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <p style="margin:0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Fechi Organics</p>
              <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Verification Code</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:48px 48px 40px;">
              <p style="margin:0 0 8px;font-size:15px;color:#40493c;line-height:1.6;">
                Use the code below for ${action}. It expires in <strong>5 minutes</strong> and can only be used once.
              </p>

              <!-- OTP digits -->
              <table cellpadding="0" cellspacing="0" style="margin:36px auto;border-collapse:separate;border-spacing:0;">
                <tr>
                  ${digits}
                </tr>
              </table>
              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e8ede6;margin:32px 0;" />

              <!-- Warning box -->
              <table cellpadding="0" cellspacing="0" width="100%" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                      <strong>Never share this code.</strong> Fechi Organics will never ask for it by phone or chat. If you didn't request this, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:rgba(64,73,60,0.6);line-height:1.6;">
                Trouble signing in? Reply to this email or visit our
                <a href="https://fechiorganics.com/help" style="color:#045a03;text-decoration:underline;">help center</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f4f6f3;padding:24px 48px;border-top:1px solid #e8ede6;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:rgba(64,73,60,0.5);line-height:1.5;">
                © ${new Date().getFullYear()} Fechi Organics. All rights reserved.<br/>
                Rooted in Nature. Formulated for You.
              </p>
              <!-- Leaf accent -->
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;opacity:0.3;margin-top:8px;">
                <path d="M12 4C12 4 6 8 6 13C6 15.761 8.239 18 11 18C11.337 18 11.666 17.96 11.98 17.887C11.993 17.925 12 17.962 12 18V20" stroke="#27731e" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M12 4C12 4 18 8 18 13C18 15.761 15.761 18 13 18" stroke="#27731e" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
