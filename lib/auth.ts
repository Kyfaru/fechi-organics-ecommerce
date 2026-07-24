import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, admin, twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import { sendOTPEmail, sendWelcomeEmail } from "@/lib/email";
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
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
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
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { role: true },
          });
          // Admin sessions expire after 8 hours; client sessions use the
          // default 7-day expiry set in the session config above.
          if (user?.role === "admin") {
            return {
              data: {
                ...session,
                expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
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
  ],

  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
