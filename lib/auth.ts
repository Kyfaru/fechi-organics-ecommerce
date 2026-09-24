import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { emailOTP, admin, twoFactor, captcha } from "better-auth/plugins";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { sendOTPEmail, sendWelcomeEmail, sendChangeEmailVerification } from "@/lib/email";
import { sendSms, hasSmsConfig } from "@/lib/sms";
import { combineLegacyPhone } from "@/lib/phone";
import { splitName } from "@/lib/name";
import { Argon2id } from "oslo/password";
import { ac, roles } from "@/lib/permissions";
import { logActivity } from "@/lib/admin-activity";
import { grantJoiningBonus, attachReferral } from "@/lib/points/referrals";
import { acquireGuestMigrationLock } from "@/lib/customers/guest-migration-lock";
import { logServerError } from "@/lib/observability-server";
import { hashValue } from "@/lib/points/anti-abuse";

// ---------------------------------------------------------------------------
// Guest checkout → real account merge.
//
// A guest checkout (components/checkout/DeliveryClient.tsx, no session) is
// resolved to a real `user` row via lib/customers/find-or-create-guest.ts —
// that row has no `account`, so nobody can log into it. If that same person
// later signs up for real with the same email, Better Auth's OWN /sign-up/email
// handler rejects it outright as a duplicate (it checks findUserByEmail
// BEFORE any databaseHooks.user.create hook ever runs — confirmed by reading
// node_modules/better-auth/dist/api/routes/sign-up.mjs — so there is no hook
// point inside user-creation itself that can intercept this).
//
// The fix runs in two matched steps around that endpoint:
//  1. hooks.before (global, path-matched) — if the incoming email belongs to
//     an accountless guest row, take a short-lived Redis lock on that email
//     (lib/customers/guest-migration-lock.ts — also checked by
//     find-or-create-guest.ts) and rename that row's email to a reserved
//     placeholder so Better Auth's own duplicate check no longer sees it,
//     then stash the mapping in Redis. The lock closes the window where a
//     concurrent guest checkout could otherwise create a second, unrelated
//     guest row under the now-freed email (whichever guest row doesn't win
//     the eventual merge would otherwise be orphaned permanently). Everything
//     else about the request (CSRF, captcha, rate limiting, password
//     hashing) still runs completely untouched, since this returns nothing
//     rather than short-circuiting.
//  2. databaseHooks.user.create.after — once Better Auth creates the genuinely
//     new user row (with a NEW id — Better Auth's create-path has no way to
//     reuse an existing id, see below), read the stash back and reassign the
//     guest's orders (and any pending referral code) onto the new account.
//     The old guest row is left in place under its placeholder email rather
//     than deleted — deleting it would need auditing every FK that can point
//     at user.id across this schema; leaving an inert, unreachable orphan is
//     the safe tradeoff.
//  3. hooks.after (global, same path) — safety net: if the signup ultimately
//     failed (bad password, rate limit, DB error, etc.) after step 1 already
//     renamed the guest row, restore its original email. Guarded by checking
//     whether the Redis stash is still present — runWithTransaction's queued
//     after-hooks (step 2) are awaited to completion before the endpoint's
//     own promise resolves, so by the time this runs, a SUCCESSFUL signup has
//     always already consumed the stash; only a failed one still has it.
//
// This does not preserve the guest's original user id (Better Auth's create()
// call has no upsert-by-id path to hook into for that) — orders are
// reassigned by FK instead, which is functionally equivalent for the
// customer and avoids reimplementing signup's password hashing, session
// creation and cookie-setting by hand.
// ---------------------------------------------------------------------------

const GUEST_MIGRATION_REDIS_PREFIX = "guest-signup-migration:";
const GUEST_MIGRATION_TTL_SECONDS = 300;

function guestPlaceholderEmail(guestUserId: string): string {
  return `guest-migrating+${guestUserId}@fechi-internal.invalid`;
}

/** Reassigns a merged-away guest's orders (and any pending referral code) onto their new real account. */
async function mergeGuestIntoNewAccount(guestUserId: string, newUserId: string): Promise<void> {
  await db.order.updateMany({ where: { userId: guestUserId }, data: { userId: newUserId } });

  // PAID only — an unpaid order costs an attacker nothing to create, so
  // honoring a referral code from one would let anyone plant a fake
  // "referral" onto a stranger's future account for free (no purchase ever
  // has to complete) just by guest-checking-out under the victim's email.
  // Requiring PAID means the attacker must actually complete a real payment
  // to plant a code, which is the same cost any legitimate referral has.
  const referralOrder = await db.order.findFirst({
    where: { userId: newUserId, pendingReferralCode: { not: null }, paymentStatus: "PAID" },
    orderBy: { createdAt: "desc" },
    select: { id: true, pendingReferralCode: true },
  });
  if (referralOrder?.pendingReferralCode) {
    await attachReferral({
      userId: newUserId,
      code: referralOrder.pendingReferralCode,
      ignoreOrderId: referralOrder.id,
    }).catch((err) => console.error("[auth] guest-merge attachReferral failed:", err));
  }
  await db.order.updateMany({
    where: { userId: newUserId, pendingReferralCode: { not: null } },
    data: { pendingReferralCode: null },
  });

  await db.clientProfile
    .update({ where: { userId: guestUserId }, data: { source: "ONLINE_GUEST_MERGED" } })
    .catch(() => {
      /* best-effort — a missing clientProfile row here changes nothing that matters */
    });
}

/**
 * The silent counterpart to the email-based merge above, for the case the
 * customer explicitly asked for: they check out as a guest, then later log
 * into (or sign up for) a real account with a DIFFERENT email — so there is
 * no email match to hook into. Instead, whoever resolved that guest checkout
 * (resolveCheckoutUserId, lib/customers/find-or-create-guest.ts) tagged the
 * guest's user row with a DEVICE identitySignal keyed off a cookie planted by
 * getOrCreateDeviceId() (lib/points/fingerprint.ts). If this browser's cookie
 * still matches, that guest's orders get folded into the account that just
 * logged in — same reassignment helper, just found by device instead of email.
 *
 * A deviceId is a random per-browser cookie we mint ourselves, not a fuzzy
 * trait fingerprint, so a match is about as trustworthy as a shared session
 * would be — safe to act on without asking the customer first.
 */
async function mergeGuestOrdersByDevice(newUserId: string, deviceId: string): Promise<void> {
  const valueHash = hashValue("DEVICE", deviceId);
  const signals = await db.identitySignal.findMany({
    where: { kind: "DEVICE", valueHash, userId: { not: newUserId } },
    select: { userId: true },
  });
  if (signals.length === 0) return;

  const candidateIds = [...new Set(signals.map((s) => s.userId))];
  for (const guestUserId of candidateIds) {
    const account = await db.account.findFirst({ where: { userId: guestUserId }, select: { id: true } });
    if (account) continue; // has a real login of its own — never merge into someone else's session
    await mergeGuestIntoNewAccount(guestUserId, newUserId);
  }
}

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

          // Silent device-based guest-order merge (see mergeGuestOrdersByDevice
          // above) — runs on every session creation (sign-in AND sign-up, any
          // method), scoped to non-admin accounts only. Best-effort: a failure
          // here must never block login.
          if (user?.role !== "admin") {
            const cookieHeader = context?.request?.headers?.get("cookie") ?? "";
            const deviceId = cookieHeader.match(/(?:^|;\s*)fechi_device=([^;]+)/)?.[1];
            if (deviceId) {
              await mergeGuestOrdersByDevice(session.userId, decodeURIComponent(deviceId)).catch((e) =>
                logServerError(e, { route: "databaseHooks.session.create.before (device-merge)", userId: session.userId }),
              );
            }
          }

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

            // Guest-checkout merge (see the block comment above the imports)
            // — reassigns a prior guest's orders onto this brand-new account
            // when this signup's email was freed from an accountless guest
            // row by the hooks.before middleware below. Best-effort: a
            // failure here must never block signup — it just leaves the
            // guest's old orders under their old (now-orphaned) row.
            try {
              const redis = getRedis();
              const migrationKey = `${GUEST_MIGRATION_REDIS_PREFIX}${user.email}`;
              const raw = await redis.getdel(migrationKey);
              if (raw) {
                const { guestUserId } = JSON.parse(raw as string) as { guestUserId: string; originalEmail: string };
                // Guards against the rare case where this hook fires from a
                // transaction that ultimately rolled back (see the block
                // comment above) — put the stash back so hooks.after's
                // safety net still restores the guest's original email.
                const stillExists = await db.user.findUnique({ where: { id: user.id }, select: { id: true } });
                if (stillExists) {
                  await mergeGuestIntoNewAccount(guestUserId, user.id);
                } else {
                  await redis.set(migrationKey, raw as string, { ex: GUEST_MIGRATION_TTL_SECONDS });
                }
              }
            } catch (err) {
              console.error("[auth] guest-checkout merge failed:", err);
            }

            // Open the loyalty account and credit the joining points. They are
            // written LOCKED and stay unspendable until this customer's first
            // successful payment, which is what stops the bonus being farmed
            // across throwaway emails (see lib/points/anti-abuse.ts).
            //
            // Best-effort: a loyalty failure must never block signup. Any
            // customer who slips through gets their account opened lazily on
            // first read, and the bonus is re-granted idempotently by the
            // referral route.
            grantJoiningBonus({ userId: user.id }).catch((err) =>
              console.error("[auth] Failed to grant joining points:", err)
            );

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

  // ---------------------------------------------------------------------------
  // Guest-checkout merge, part 1 and 3 (see the block comment above the
  // imports for the full design). This global hook fires for every request —
  // both branches immediately no-op unless the path is /sign-up/email.
  // ---------------------------------------------------------------------------
  hooks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- createAuthMiddleware's generic ctx type doesn't infer here (same gap affects every other Better Auth callback in this file, e.g. databaseHooks.session below)
    before: createAuthMiddleware(async (ctx: any) => {
      if (ctx.path !== "/sign-up/email") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : null;
      if (!email) return;

      try {
        const guest = await db.user.findUnique({
          where: { email },
          select: { id: true, role: true },
        });
        if (!guest || guest.role !== "client") return;
        const guestAccount = await db.account.findFirst({ where: { userId: guest.id }, select: { id: true } });
        if (guestAccount) return; // has a real login already — not a guest placeholder

        // Hold the migration lock for the rest of this signup request. While
        // held, findOrCreateGuestCustomer refuses to create a NEW guest row
        // under this email even though the row is about to be renamed away
        // below — without this, a guest checkout landing in that narrow
        // window would create an unrelated second guest row under the
        // now-free email, and whichever of the two never gets merged is
        // orphaned permanently (see the block comment above the imports).
        const lockAcquired = await acquireGuestMigrationLock(email);
        if (!lockAcquired) return; // another migration for this email is already in flight — let Better Auth's normal duplicate-email rejection handle it

        await db.user.update({
          where: { id: guest.id },
          data: { email: guestPlaceholderEmail(guest.id) },
        });
        await getRedis().set(
          `${GUEST_MIGRATION_REDIS_PREFIX}${email}`,
          JSON.stringify({ guestUserId: guest.id, originalEmail: email }),
          { ex: GUEST_MIGRATION_TTL_SECONDS },
        );
      } catch (err) {
        // Never block signup over this — worst case, the customer just gets
        // Better Auth's normal "email already in use" response instead of
        // the merge, same as before this feature existed.
        console.error("[auth] guest-checkout pre-signup check failed:", err);
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the `before` hook above
    after: createAuthMiddleware(async (ctx: any) => {
      if (ctx.path !== "/sign-up/email") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : null;
      if (!email) return;

      // Only reachable if step 2 (databaseHooks.user.create.after) never
      // consumed the stash — i.e. this signup attempt failed. See the block
      // comment above the imports for why this ordering is guaranteed.
      let migrationRecovery: { guestUserId: string; originalEmail: string } | null = null;
      try {
        const migrationKey = `${GUEST_MIGRATION_REDIS_PREFIX}${email}`;
        const raw = await getRedis().getdel(migrationKey);
        if (!raw) return;
        migrationRecovery = JSON.parse(raw as string) as { guestUserId: string; originalEmail: string };
        await db.user.update({
          where: { id: migrationRecovery.guestUserId },
          data: { email: migrationRecovery.originalEmail },
        });
      } catch (err) {
        console.error("[auth] guest-checkout rename rollback failed:", err);
        // Not best-effort noise — an unrecovered rename here permanently
        // strands the guest's order history under an unreachable placeholder
        // email with no automatic retry path. Surface it on the admin
        // error-logs page so a human can fix it manually.
        await logServerError(err, {
          route: "POST /api/auth/sign-up/email (guest-migration rollback)",
          userId: migrationRecovery?.guestUserId,
        }).catch(() => {});
      }
    }),
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
        // method-choice screen's handleMethodChoice) — else whichever
        // channel(s) the account has enabled (user.twoFaEmail/twoFaPhone),
        // else email.
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
            // No explicit channel on this request — fall back to whichever
            // channel(s) the account has actually enabled (independent
            // user.twoFaEmail/twoFaPhone booleans, shared with the customer
            // 2FA flow). Prefers sms only when phone is enabled and email
            // isn't; defaults to email otherwise.
            const dbUser = await db.user.findUnique({
              where: { id: user.id },
              select: { twoFaEmail: true, twoFaPhone: true },
            });
            method = dbUser?.twoFaPhone && !dbUser?.twoFaEmail ? "sms" : "email";
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
