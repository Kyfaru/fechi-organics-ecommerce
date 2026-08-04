import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, admin, twoFactor, captcha } from "better-auth/plugins";
import { db } from "@/lib/db";
import { sendOTPEmail, sendWelcomeEmail, sendChangeEmailVerification } from "@/lib/email";
import { splitName } from "@/lib/name";
import { Argon2id } from "oslo/password";
import { ac, roles } from "@/lib/permissions";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    password: {
      hash: (password) => new Argon2id().hash(password),
      verify: ({ hash, password }) => new Argon2id().verify(hash, password),
    },
  },

  // -------------------------------------------------------------------------
  // Additional user fields — declared here so Better Auth accepts and persists
  // them on sign-up instead of silently dropping them.
  // -------------------------------------------------------------------------
  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: false,
        input: true,
      },
      lastName: {
        type: "string",
        required: false,
        input: true,
      },
      phone: {
        type: "string",
        required: false,
        input: true,
      },
      country: {
        type: "string",
        required: false,
        input: true,
      },
      city: {
        type: "string",
        required: false,
        input: true,
      },
    },

    // -------------------------------------------------------------------------
    // Email changes — off by default in Better Auth. Google/Facebook sign-in
    // is matched by the linked account's provider id (see accountLinking),
    // not by email, so changing email here never revokes social sign-in.
    // -------------------------------------------------------------------------
    changeEmail: {
      enabled: true,
      // Most users here aren't email-verified (OTP sign-in / social sign-in
      // don't set it), so let them change email immediately for that case...
      updateEmailWithoutVerification: true,
      // ...but if the current email IS verified, require a confirmation
      // click on the OLD address first, before the change takes effect.
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendChangeEmailVerification(user.email, url, user.name, newEmail);
      },
    },
  },

  // Sent for the "verify your new email" link after an unverified user's
  // email is changed immediately above (updateEmailWithoutVerification).
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendChangeEmailVerification(user.email, url, user.name);
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      mapProfileToUser: (profile) => ({
        firstName: profile.given_name,
        lastName: profile.family_name,
      }),
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
      // Facebook's default profile fields don't include first/last name
      // separately — split the display name instead of requesting more scope.
      mapProfileToUser: (profile) => splitName(profile.name),
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  rateLimit: {
    // Applies globally to all auth routes. Admin gets additional rate limiting
    // enforced at the API route level (app/api/auth/[...all]/route.ts) to make
    // brute-forcing admin credentials significantly harder.
    window: 60,
    max: 10,
  },

  // ---------------------------------------------------------------------------
  // Database hooks — per-role session expiry and profile auto-creation.
  // ---------------------------------------------------------------------------
  databaseHooks: {
    session: {
      create: {
        before: async (session, context) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { role: true },
          });

          // captchaVerifiedAt: set when this request itself carried a
          // validated x-captcha-response header (signIn.email / signUp.email,
          // where the session is created in the same request the captcha
          // plugin gated), or when this session comes from /sign-in/email-otp
          // — that endpoint is never captcha-gated directly (the token is
          // single-use and already spent sending the OTP), but it's only
          // reachable after a successful /email-otp/send-verification-otp,
          // which IS gated, so trusting it here is safe.
          const path = context?.path ?? "";
          const hadCaptchaHeader = !!context?.request?.headers?.get("x-captcha-response");
          const captchaVerifiedAt =
            hadCaptchaHeader || path.includes("/sign-in/email-otp")
              ? new Date()
              : undefined;

          // Admin sessions expire after 8 hours; client sessions use the
          // default 7-day expiry set in the session config above.
          if (user?.role === "admin" || captchaVerifiedAt) {
            return {
              data: {
                ...session,
                ...(user?.role === "admin" && {
                  expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
                }),
                ...(captchaVerifiedAt && { captchaVerifiedAt }),
              },
            };
          }
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          // Auto-create the matching profile row whenever a user is created.
          // adminProfile and clientProfile are defined in the schema redesign.
          //
          // isSuperAdmin defaults to false here. This row is created before
          // callers like app/api/admin/staff/invite/route.ts get a chance to
          // set the real role, so it must never default to a bypass — the
          // invite route's own upsert is what sets role/isSuperAdmin for
          // real. (Previously this hardcoded `true`, which silently made
          // every invited staff member a super-admin regardless of the role
          // picked in the invite form, since the invite route's upsert then
          // took the `update` branch and never touched isSuperAdmin.)
          if (user.role === "admin") {

            await db.adminProfile.create({
              data: {
                userId: user.id,
                fullName: user.name,
                isSuperAdmin: false,
              },
            });
          } else {

            await db.clientProfile.create({
              data: { userId: user.id },
            });

            // Best-effort — a failed welcome email must never block signup.
            if (process.env.RESEND_API_KEY && user.email) {
              sendWelcomeEmail(user.email, user.name ?? "there").catch((err) =>
                console.error("[auth] Failed to send welcome email:", err)
              );
            }
          }
        },
      },
    },
  },

  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (process.env.RESEND_API_KEY) {
          await sendOTPEmail(email, otp, type);
        } else {
          // Dev fallback — log to console when RESEND_API_KEY is not set
          console.log(`[Auth DEV] OTP for ${email} (${type}): ${otp}`);
        }
      },
      otpLength: 5,
      expiresIn: 300, // 5 minutes
      sendVerificationOnSignUp: false,
    }),
    admin({
      // New users are clients by default; admins are provisioned manually.
      defaultRole: "client",
      adminRoles: ["admin"],
      // Fine-grained resource/action permissions (lib/permissions.ts).
      // Every permission check passes adminProfile.role explicitly rather
      // than relying on user.role (which stays the coarse client|admin enum).
      ac,
      roles,
    }),
    twoFactor({
      issuer: "Fechi Organics",
      otpOptions: {
        period: 30,
        digits: 6,
      },
    }),
    // Bot protection on the credential forms — signup, admin login, and the
    // customer email-OTP login's send/resend step (its subsequent
    // /sign-in/email-otp call is deliberately not listed here; see the
    // captchaVerifiedAt comment in databaseHooks above).
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: process.env.TURNSTILE_SECRET_KEY!,
      endpoints: ["/sign-up/email", "/sign-in/email", "/email-otp/send-verification-otp"],
    }),
  ],

  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    "https://www.fechiorganics.shop",
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
