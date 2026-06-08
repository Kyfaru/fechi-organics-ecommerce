import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, admin, twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import { sendOTPEmail } from "@/lib/email";
import { Argon2id } from "oslo/password";

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
          if (user.role === "admin") {
          
            await db.adminProfile.create({
              data: {
                userId: user.id,
                fullName: user.name,
                permissions: {},
              },
            });
          } else {
          
            await db.clientProfile.create({
              data: { userId: user.id },
            });
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
      adminRole: ["admin"],
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
