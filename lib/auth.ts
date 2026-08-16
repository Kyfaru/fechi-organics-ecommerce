import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, admin, twoFactor, captcha } from "better-auth/plugins";
import { db } from "@/lib/db";
import { sendOTPEmail, sendWelcomeEmail, sendChangeEmailVerification } from "@/lib/email";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { splitName } from "@/lib/name";
import { Argon2id } from "oslo/password";
import { ac, roles } from "@/lib/permissions";
import { logActivity } from "@/lib/admin-activity";

// ---------------------------------------------------------------------------
// Admin sessions are anchored to the next midnight in Africa/Nairobi (EAT,
// UTC+3, no DST) rather than a rolling window — see databaseHooks.session
// below. Kept as a plain fixed offset rather than an Intl/timezone library
// call since EAT never observes DST, so the offset is always exactly +3h.
// ---------------------------------------------------------------------------
function nextMidnightNairobi(): Date {
  const now = new Date();
  const nairobiOffsetMs = 3 * 60 * 60 * 1000;
  const nairobiNow = new Date(now.getTime() + nairobiOffsetMs);
  const next = new Date(Date.UTC(
    nairobiNow.getUTCFullYear(), nairobiNow.getUTCMonth(), nairobiNow.getUTCDate() + 1
  ));
  return new Date(next.getTime() - nairobiOffsetMs);
}

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

          // Sign-in audit log — admin only. Fire-and-forget: a session is
          // only ever created here once a sign-in is genuinely complete
          // (the twoFactor plugin's own hook swaps in a scoped two-factor
          // cookie and deletes the real session before a 2FA challenge is
          // resolved — see the sendOTP comment below), so this can't
          // double-log or log an incomplete challenge. Never awaited: a
          // logging failure must not block session creation.
          if (user?.role === "admin") {
            db.adminProfile.findUnique({ where: { userId: session.userId }, select: { id: true } })
              .then((profile) => {
                if (profile) void logActivity(profile.id, "Signed in", "auth", undefined, undefined, { path: context?.path }, "INFO");
              })
              .catch((e) => console.warn("[auth] sign-in activity log failed:", e));
          }

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

          // Admin sessions expire at the next midnight (Africa/Nairobi)
          // rather than a rolling window, so every admin is forced to
          // re-authenticate once a day regardless of login time. Client
          // sessions use the default 7-day expiry set in the session
          // config above.
          if (user?.role === "admin" || captchaVerifiedAt) {
            return {
              data: {
                ...session,
                ...(user?.role === "admin" && {
                  expiresAt: nextMidnightNairobi(),
                }),
                ...(captchaVerifiedAt && { captchaVerifiedAt }),
              },
            };
          }
        },
      },
      // -----------------------------------------------------------------
      // Activity-based session refresh (session.updateAge above) recomputes
      // expiresAt from the flat 7-day session.expiresIn on every active
      // request (see node_modules/better-auth/dist/api/routes/session.mjs,
      // the `needsRefresh` branch calling internalAdapter.updateSession),
      // which would silently undo the midnight cutoff set in create.before
      // above the first time an admin is active a day after logging in.
      // This hook re-anchors it the same way on every refresh.
      //
      // The update payload only ever contains { expiresAt, updatedAt } (it's
      // keyed by token, not userId — see internal-adapter.mjs's
      // updateSession), so role can't be read off `session` here. Instead it
      // comes from context.context.session, which the get-session route sets
      // (ctx.context.session = session) immediately before calling
      // updateSession, in the same request — database hooks receive that
      // same AuthContext instance (see to-auth-endpoints.mjs's
      // `internalContext` construction). If that internal wiring ever
      // changes upstream, `role` reads as undefined and this hook no-ops
      // rather than mis-firing on the wrong sessions.
      // -----------------------------------------------------------------
      update: {
        before: async (session, context) => {
          if (!session.expiresAt) return;
          const role = (context?.context?.session?.user as { role?: string } | undefined)?.role;
          if (role !== "admin") return;

          return {
            data: {
              ...session,
              expiresAt: nextMidnightNairobi(),
            },
          };
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
        digits: 6,
        period: 10, // minutes
        allowedAttempts: 5,
        // Delivers the code Better Auth generates internally for its own
        // /two-factor/send-otp + /two-factor/verify-otp endpoints. Replaces
        // the old hand-rolled app/api/admin/otp/send + /verify routes, which
        // checked for a real session — but this plugin's own sign-in hook
        // (below, in the twoFactor plugin's "after" hook) deletes the real
        // session and swaps in a scoped two-factor cookie before those
        // routes ever ran, so they always 401'd on a returning admin.
        //
        // Channel (email vs SMS) isn't a Better Auth concept — there's only
        // one generic "otp" method. Resolution order: an explicit per-login
        // override sent by the client as the x-2fa-channel header (lets a
        // RETURNING admin/customer pick a different channel than their
        // stored default without needing a real session to persist it —
        // Better Auth deletes the real session before this fires, see the
        // method-choice screen's handleMethodChoice) — else the admin's
        // stored preference (adminProfile.twoFaMethod), else email.
        //
        // Better Auth's /two-factor/send-otp always responds { status: true }
        // regardless of what this callback does (fire-and-forget — see
        // otp/index.mjs), so a thrown/failed send here is otherwise
        // completely invisible to the client. Every path below is wrapped so
        // a failure never means "no code, no error, nothing" — SMS failures
        // fall back to email (when an email is on file) instead.
        sendOTP: async ({ user, otp }, ctx) => {
          const headerChannel = ctx?.headers?.get?.("x-2fa-channel");
          const requestedChannel = headerChannel === "sms" || headerChannel === "email" ? headerChannel : null;

          let method: "email" | "sms" = "email";
          if (requestedChannel) {
            method = requestedChannel;
          } else {
            // null for customers (no adminProfile row) — falls through to "email".
            const profile = await db.adminProfile.findUnique({
              where: { userId: user.id },
              select: { twoFaMethod: true },
            });
            method = profile?.twoFaMethod === "sms" ? "sms" : "email";
          }

          async function sendViaEmail() {
            if (!user.email) {
              console.error("[auth] 2FA OTP: no email on file for user", user.id);
              return;
            }
            await sendOTPEmail(user.email, otp, "sign-in");
          }

          if (method === "sms") {
            const dbUser = await db.user.findUnique({
              where: { id: user.id },
              select: { phone: true, phoneCode: true },
            });
            const phone = dbUser?.phone ? combineLegacyPhone(dbUser.phone, dbUser.phoneCode) : null;
            if (phone && hasSmsConfig()) {
              try {
                await sendSms(phone, `Your Fechi Organics login code: ${otp}. Valid for 10 minutes.`);
                return;
              } catch (e) {
                console.error("[auth] 2FA OTP: SMS send failed for user", user.id, "— falling back to email:", e);
              }
            } else {
              console.error("[auth] 2FA OTP: SMS unavailable (no phone on file or not configured) for user", user.id, "— falling back to email");
            }
            await sendViaEmail();
            return;
          }

          await sendViaEmail();
        },
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
