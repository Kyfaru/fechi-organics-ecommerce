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
