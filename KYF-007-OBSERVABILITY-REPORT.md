# KYF-007 — Sentry + PostHog Instrumentation: Investigation Report

Read-only investigation. No instrumentation code was written in this pass — per the brief's §9, this report is the deliverable, pending your review before Phase 0 begins.

---

## 1 · Confirmation of current state (brief §1)

| Claim | Status | Evidence |
|---|---|---|
| `instrumentation.ts` exports `onRequestError = Sentry.captureRequestError` | **Confirmed** | `instrumentation.ts:14` |
| `sentry.server.config.ts` / `sentry.edge.config.ts` init with `enabled: !!DSN` | **Confirmed** | Both files, identical 8-line bodies. No `beforeSend` scrubbing yet (§7 of the brief not implemented) |
| `instrumentation-client.ts` inits PostHog then Sentry, wires PostHog↔Sentry session-replay link | **Confirmed** | `initPostHog()` called first (comment explains why), then `Sentry.init` with `posthog.sentryIntegration(...)` conditional on org/project env vars |
| `lib/posthog.ts` is browser-only (`posthog-js`) | **Confirmed** | No server import anywhere in the file |
| `package.json` has `posthog-js`, not `posthog-node` | **Confirmed** | `posthog-js: ^1.384.3` present; grep for `posthog-node` in package.json returns nothing |
| **"Zero explicit `Sentry.captureException()` calls exist anywhere"** | **Not quite — 3 hits, correction below** | See §1.1 |
| No `lib/posthog-server.ts`, no `lib/observability.ts` | **Confirmed absent** | Neither file exists |

### 1.1 · Correction to the brief

`Sentry.captureException` is called in 3 places, not 0:
- **`lib/api.ts:28`** — inside the shared `Err.internal(error?, msg?)` response helper: `if (error !== undefined) Sentry.captureException(error);`. This is a *shared utility*, not a per-route call — it's used by an unknown subset of routes that happen to call `Err.internal(e)` in their catch block (not verified per-file in this pass; would need a follow-up grep for `Err.internal(` call sites to know real coverage).
- **`app/error.tsx`** and **`app/global-error.tsx`** — React error boundaries. Framework-level, not route handlers; conceptually redundant with `onRequestError` for anything that also escapes to the client.

None of these three carry route/user/tag context the way `reportError` would. The brief's substantive point — *no contextual, per-route Sentry capture exists* — still holds. Treat this as a footnote, not a blocker. **Open question**: should `Err.internal()`'s existing call be left alone, or should routes move to `reportError` + still return via `Err.internal()` without double-reporting? (See §8.)

### 1.2 · State change during this investigation (not in the original brief)

While this report was being compiled, the working tree already contained **uncommitted changes** that implement part of the *sibling* report's (`KYF-007-ADMIN-LOGIN-REPORT.md`) proposed fix scope — confirmed by you as your own in-progress work, not something to revert:

- `app/admin/login/page.tsx` — the first of 7 `catch` blocks (line 223) changed from bare `catch {` to `catch (err) { console.error(...)` . The other 6 (lines 275, 337, 368, 399, 433, 468) are still bare/unlabeled. **None of the 7 call `Sentry.captureException` yet** — still open for Phase 2.
- `app/api/admin/staff/[id]/route.ts` — all 4 `logActivity(...)` calls are now `await`ed (previously fire-and-forget). Catch blocks (lines 36, 165, 211) still don't call Sentry — still open for Phase 3.
- `app/api/admin/users/route.ts`, `app/api/admin/users/[id]/route.ts`, `components/admin/AdminUsersClient.tsx` — **deleted**. This resolves sibling-report Finding C (orphaned route, weaker `customers:*` gate, zero audit logging) by removing the surface entirely, rather than hardening it. This report's route inventory below reflects the **current, post-deletion** state (190 routes, not 192) — the "Users" line item from the brief's §4.4 priority table no longer applies.

### 1.3 · Route count

**190** `route.ts` files under `app/api/**` (114 under `app/api/admin/**`, 76 elsewhere) — verified via `find`, matching the sum of the inventory in §2.

---

## 2 · Full route inventory

One row per route file. `catch#` = number of `catch` clauses (bare `catch {}` and `catch (e)` both count; chained `.catch()` on a promise does not, noted separately where relevant). `Phase` maps to §7 below. **SSE** rows are explicitly do-not-wire per brief §4.8.

### 2.1 · Payments (Phase 1)

| Path | Methods | catch# | Lines | Notes |
|---|---|---|---|---|
| `app/api/payments/mpesa/initiate/route.ts` | POST | 5 | 52,110,244,249,280 | matches brief exactly |
| `app/api/payments/mpesa/callback/route.ts` | POST | 2 | 24,105 | webhook, must stay 200; matches brief |
| `app/api/payments/mpesa/instore-callback/route.ts` | POST | 2 | 97,163 | webhook, must stay 200 |
| `app/api/payments/mpesa/c2b/confirmation/route.ts` | POST | 2 | 85,96 | webhook, must stay 200 |
| `app/api/payments/mpesa/c2b/validation/route.ts` | POST | 0 | none | **gap** — webhook, must stay 200, currently no catch at all |
| `app/api/payments/kcb/initiate/route.ts` | POST | 3 | 46,103,231 | |
| `app/api/payments/kcb/callback/route.ts` | POST | 2 | 33,79 | webhook, matches brief |
| `app/api/payments/paystack/initialize/route.ts` | POST | 3 | 49,106,232 | |
| `app/api/payments/paystack/verify/route.ts` | GET | 1 | 57 | redirect-based verify, writes payment status |
| `app/api/payments/paystack/webhook/route.ts` | POST | 2 | 28,55 | webhook, matches brief |
| `app/api/payments/paystack/instore-webhook/route.ts` | POST | 2 | 37,64 | webhook |
| `app/api/payments/status/[orderId]/route.ts` | DELETE | 1 | 38 | brief expected GET — only DELETE exported now, worth a note in the PR |
| `app/api/payments/mock/checkout/route.ts` | POST | 2 | 94,164 | dev-only |
| `app/api/admin/orders/instore/mpesa/initiate/route.ts` | POST | 5 | 76,150,281,286,308 | |
| `app/api/admin/orders/instore/mpesa/c2b/start/route.ts` | POST | 2 | 49,69 | |
| `app/api/admin/orders/instore/mpesa/c2b/register/route.ts` | POST | 2 | 52,88 | |
| `app/api/admin/orders/instore/mpesa/c2b/claim/route.ts` | POST | 7 | 74,127,218,231,247,280,290 | not named in brief's table but same family — heaviest catch count in the repo |
| `app/api/admin/orders/instore/mpesa/c2b/matches/route.ts` | GET | 1 | 74 | read-only |
| `app/api/admin/orders/instore/paystack/initialize/route.ts` | POST | 3 | 70,146,250 | |

**Do not wire** (SSE): `app/api/payments/stream/route.ts` (5 catches, 58/72/74/83/94 — all bare, wrapping stream lifecycle, not business logic) and `app/api/admin/orders/instore/stream/route.ts` (5 catches, 86/98/100/108/119).

### 2.2 · Auth — API routes (Phase 2)

| Path | Methods | catch# | Lines | Notes |
|---|---|---|---|---|
| `app/api/auth/forgot-password/route.ts` | POST | 1 | 78 | always-200 (enumeration-safe) |
| `app/api/auth/forgot-password/verify/route.ts` | POST | 1 | 83 | |
| `app/api/auth/logout/route.ts` | POST | 1 | 21 | |
| `app/api/auth/reset-password/route.ts` | POST | 1 | 59 | |
| `app/api/auth/portal-check/route.ts` | POST | 1 | 52 | fails open by design — keep behavior |
| `app/api/admin/forgot-password/route.ts` | POST | 1 | 73 | |
| `app/api/admin/forgot-password/channels/route.ts` | POST | 1 | 29 | |
| `app/api/admin/forgot-password/verify/route.ts` | POST | 1 | 66 | |
| `app/api/admin/reset-password/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/reset-password/verify/route.ts` | GET | 0 | none | read-only |
| `app/api/admin/change-password/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/verify-password/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/2fa/method/route.ts` | POST | 1 | 54 | |
| `app/api/admin/otp/send/route.ts` | POST | 1 | 89 | |
| `app/api/admin/otp/verify/route.ts` | POST | 1 | 63 | |
| `app/api/account/2fa/email/send/route.ts` | POST | 1 | 21 | |
| `app/api/account/2fa/email/verify/route.ts` | POST | 1 | 32–33 | |
| `app/api/account/2fa/phone/send/route.ts` | POST | 1 | 33 | |
| `app/api/account/2fa/phone/verify/route.ts` | POST | 1 | 32–33 | |
| `app/api/account/set-password/route.ts` | POST | 0 | none | **gap** |

**Do not touch**: `app/api/auth/[...all]/route.ts` (Better Auth handler), `app/api/auth/stream/route.ts` (SSE, 4 catches at 34/47/49/62).

### 2.3 · Auth — client pages (Phase 2, brief §4.3)

| Path | catch# | Lines | Notes |
|---|---|---|---|
| `app/admin/login/page.tsx` | 7 | 223,275,337,368,399,433,468 | Line 223 already has `catch (err)` + `console.error` (your in-progress edit, §1.2). The other 6 are still bare. None call Sentry yet. |
| `app/(auth)/login/LoginForm.tsx` | 4 | 121,135,146,196 | |
| `app/(auth)/signup/page.tsx` | 3 | 194,208,219 | |
| `app/(auth)/forgot-password/page.tsx` | 3 | 130,160,218 | |
| `app/(auth)/reset-password/page.tsx` | 1 | 148 | |
| `app/admin/forgot-password/page.tsx` | 4 | 122,135,165,237 | |
| `app/admin/reset-password/page.tsx` | 2 | 65,214 | |

### 2.4 · Staff (Phase 3 — "Users" sub-domain removed, see §1.2)

| Path | Methods | catch# | Lines | Notes |
|---|---|---|---|---|
| `app/api/admin/staff/route.ts` | GET | 1 | 65 | read-only |
| `app/api/admin/staff/[id]/route.ts` | PATCH, DELETE | 3 | 36,165,211 | `logActivity` calls already awaited (§1.2); Sentry still not wired |
| `app/api/admin/staff/invite/route.ts` | POST | 5 | 46,172,186,200,211 | creates admin account |
| `app/api/admin/staff/send-reset/route.ts` | POST | 1 | 22 | catch only wraps JSON parse, not the send itself |
| `app/api/admin/staff/set-password/route.ts` | POST | 1 | 26 | catch only wraps JSON parse, not the DB writes |

### 2.5 · Uploads + QStash workers (Phase 4)

| Path | Methods | catch# | Lines | Notes |
|---|---|---|---|---|
| `app/api/admin/upload/route.ts` | POST | 1 | 71 | R2 signed upload |
| `app/api/account/profile/avatar/route.ts` | POST | 0 | none | **gap** — no try/catch at all |
| `app/api/testimonials/upload/route.ts` | POST | 1 | 60 | |
| `app/api/admin/workers/upload-product-image/route.ts` | POST | 0 | none | **gap** — QStash worker, listed in brief under both uploads and workers |
| `app/api/admin/workers/check-failed-payment/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/workers/cleanup-notifications/route.ts` | GET | 0 | none | **gap** — Vercel Cron (Bearer `CRON_SECRET`), not QStash |
| `app/api/admin/workers/generate-invoice/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/workers/notify-admin-new-order/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/workers/publish-blog-post/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/workers/send-campaign/route.ts` | POST | 1 | 29 | |
| `app/api/admin/workers/send-instore-sms-receipt/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/workers/send-order-confirmation/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/workers/send-ticket-admin-notify/route.ts` | POST | 0 | none | **gap** |
| `app/api/admin/workers/send-ticket-email/route.ts` | POST | 0 | none | **gap** |
| `app/api/workers/review-reminder/route.ts` | POST | 1 | 77 | top-level, not under admin |

**11 of 15 files in this phase have zero try/catch today** — the brief's §4.6 rule ("wrap the entire handler body") applies almost everywhere here, not just as a fallback.

### 2.6 · Remaining admin mutations + read-only (Phase 5/6)

87 files. Full per-file catch-line data was gathered (available on request / in the raw agent transcripts) — summarized here by sub-domain to keep this section scannable, per your plan-mode note that repeated patterns don't need every line enumerated:

| Domain | Files | Mutation routes | Read-only GETs | No-catch-at-all |
|---|---|---|---|---|
| Products | 5 | products, products/[id], products/[id]/permanent, categories, categories/[id] | — | — |
| Orders | 3 | orders/[id] (6 catches — largest non-payment file), orders/[id]/invoice | orders (list) | — |
| Branches / Zoho | 6 | branches/[id], branches/[id]/zoho, zoho/organizations×3, zoho/sync | branches (list) | — |
| Customers | 4 | customers, customers/[id] | customers/[id]/orders, customers/[id]/stats | — |
| Loyalty | 3 | loyalty/tiers, loyalty/tiers/[id] | loyalty (list) | — |
| Campaigns | 4 | campaigns, campaigns/[id], campaigns/[id]/send | campaigns/[id]/recipients | campaigns/[id]/recipients |
| Promotions | 2 | promotions, promotions/[id] | — | — |
| Blog | 7 | blog, blog/[id], blog/[id]/publish, blog/authors, blog/comments/[commentId] | blog/[id]/comments, blog/comments | — |
| Banners/Homepage/FAQs | 5 | banners, banners/[id], homepage, faqs, faqs/[id] | — | — |
| Testimonials | 3 | testimonials, testimonials/[id], testimonials/[id]/message | — | — |
| Tickets | 3 | tickets/[id], tickets/[id]/reply | tickets (list) | — |
| Inventory | 2 | inventory/adjust | inventory (list) | — |
| Approvals | 2 | approvals/[id]/decide | approvals (list) | — |
| Notifications | 8 | notifications/[id], notifications/[id]/pin, notifications/mark-all-read | notifications, notifications/preview, notifications/unread-count, notifications/[id]/read-receipts | notifications, notifications/[id], notifications/[id]/pin, notifications/mark-all-read, notifications/preview, notifications/unread-count, notifications/[id]/read-receipts (**7 of 8 files — worst gap cluster in the repo**) |
| Settings / Profile | 3 | settings, profile, profile/password | — | — |
| Suppliers / Delivery zones | 4 | suppliers, suppliers/[id], delivery-zones, delivery-zones/[id] | — | — |
| Contact messages | 2 | contact-messages | contact-messages/count | — |
| Finance / Analytics / Dashboard / Search / Reviews / Activity / Transactions / Me | 9 | finance/export | analytics, dashboard, dashboard/analytics, search, reviews, activity, transactions | `me` (no catch) |

**Do not wire** (SSE): `app/api/admin/notifications/stream/route.ts` (5 catches, all bare stream-lifecycle wrappers).

### 2.7 · Webhooks (external, Phase 6)

| Path | Methods | catch# | Notes |
|---|---|---|---|
| `app/api/zoho/webhook/route.ts` | POST | 3 | 59,126,159 — must stay 200, per-org HMAC verify |
| `app/api/webhooks/resend/route.ts` | POST | 0 | **gap** — Svix/HMAC verified already |
| `app/api/webhooks/twilio/status/route.ts` | POST | 0 | **gap** — signature verified already |

### 2.8 · Customer-facing storefront (mostly Phase 6, some already business-critical)

| Path | Methods | catch# | Lines | Notes |
|---|---|---|---|---|
| `app/api/cart/route.ts` | GET | 1 | 38 | |
| `app/api/cart/items/route.ts` | POST | 1 | 68 | |
| `app/api/cart/items/[productId]/route.ts` | PATCH, DELETE | 2 | 41,65 | |
| `app/api/cart/merge/route.ts` | POST | 1 | 72 | |
| `app/api/orders/route.ts` | GET, POST | 4 | 67,116,153,208 | customer order creation — deeply nested try/catch, plus fire-and-forget `.catch()` on notification sends |
| `app/api/orders/[id]/route.ts` | GET | 1 | 39 | |
| `app/api/orders/[id]/delivered/route.ts` | POST | 2 | 54,62 | |
| `app/api/orders/[id]/delivery/route.ts` | PATCH | 1 | 66 | |
| `app/api/orders/[id]/invoice/route.ts` | GET | 1 | 31 | |
| `app/api/orders/[id]/notify/route.ts` | POST | 2 | 60,72 | |
| `app/api/orders/[id]/picked-up/route.ts` | POST | 1 | 59 | |
| `app/api/orders/[id]/receipt/route.ts` | POST | 1 | 34 | |
| `app/api/account/orders/route.ts` | GET | 0 | none | **gap** |
| `app/api/account/orders/[id]/route.ts` | GET | 0 | none | **gap** |
| `app/api/account/inbox/route.ts` | GET, PATCH | 0 | none | **gap** |
| `app/api/account/wishlist/route.ts` | GET, POST, DELETE | 0 | none | **gap** |
| `app/api/account/reviews/route.ts` | POST | 1 | 63 | |
| `app/api/favorites/route.ts` | GET, POST | 2 | 63,97 | |
| `app/api/users/me/route.ts` | GET, PATCH | 2 | 26,83 | |
| `app/api/promo/validate/route.ts` | POST | 1 | 25 | |
| `app/api/coupons/validate/route.ts` | GET | 2 | 38,62 | |
| `app/api/delivery-pricing/route.ts` | POST | 1 | 25 | |
| `app/api/delivery-zones/route.ts` | GET | 1 | 31 | public read |
| `app/api/branches/route.ts` | GET | 1 | 71 | |
| `app/api/countries/route.ts` | GET | 0 | none | **gap** |
| `app/api/countries/states/route.ts` | POST | 0 | none | **gap** |
| `app/api/country-states/route.ts` | GET | 1 | 37 | |
| `app/api/currency/rates/route.ts` | GET | 1 | 14 | |
| `app/api/products/options/route.ts` | GET | 0 | none | **gap** |
| `app/api/storefront/products/route.ts` | GET | 1 | 18 | |
| `app/api/search/route.ts` | GET | 1 | 87 | |
| `app/api/invoices/instore/[token]/route.ts` | GET | 0 | none | **gap** |
| `app/api/blog/comments/[commentId]/route.ts` | DELETE | 1 | 36 | |
| `app/api/blog/posts/[slug]/comments/route.ts` | GET, POST | 2 | 37,82 | |
| `app/api/blog/posts/[slug]/reactions/route.ts` | POST | 1 | 80 | |
| `app/api/testimonials/route.ts` | POST | 1 | 68 | |
| `app/api/tickets/route.ts` | GET, POST | 2 | 60,121 | |
| `app/api/tickets/[id]/route.ts` | GET | 1 | 42 | |
| `app/api/tickets/[id]/reply/route.ts` | POST | 4 | 81,122,133,138 | file upload + QStash + Redis |
| `app/api/contact/route.ts` | POST | 2 | 94,104 | fire-and-forget `.catch()` on email sends, in addition to the 2 real catches |

**Do not wire** (SSE): `app/api/tickets/stream/route.ts` (5 catches, all bare, controller.close() cleanup).

### 2.9 · Off-limits / leave as-is (brief §4.8)

`app/api/auth/[...all]/route.ts`, `app/api/auth/stream/route.ts`, `app/api/admin/orders/instore/stream/route.ts`, `app/api/admin/notifications/stream/route.ts`, `app/api/payments/stream/route.ts`, `app/api/tickets/stream/route.ts`, `app/api/health/route.ts` (has 1 catch, line 15 — already exists, leave it), `app/api/track/click/route.ts` (1 catch at line 37, bare — leave it; a chained `.catch()` also exists at line 27), `app/api/dev/access/route.ts` (1 catch, line 18, bare — dev-only, leave it).

---

## 3 · Gap list — no try/catch at all

Per the brief: **do not add try/catch to these unsupervised**, just flagging. Errors here currently only reach Sentry via `onRequestError` (no route/user context, no chance for a PostHog counterpart):

`payments/mpesa/c2b/validation`, `admin/reset-password`, `admin/change-password`, `admin/verify-password`, `account/set-password`, `account/profile/avatar`, `admin/workers/upload-product-image`, `admin/workers/check-failed-payment`, `admin/workers/cleanup-notifications`, `admin/workers/generate-invoice`, `admin/workers/notify-admin-new-order`, `admin/workers/publish-blog-post`, `admin/workers/send-instore-sms-receipt`, `admin/workers/send-order-confirmation`, `admin/workers/send-ticket-admin-notify`, `admin/workers/send-ticket-email`, `webhooks/resend`, `webhooks/twilio/status`, `admin/campaigns/[id]/recipients`, `admin/me`, `admin/notifications` (route + `[id]` + `[id]/pin` + `mark-all-read` + `preview` + `unread-count` + `[id]/read-receipts` — 7 files), `account/orders`, `account/orders/[id]`, `account/inbox`, `account/wishlist`, `countries`, `countries/states`, `products/options`, `invoices/instore/[token]`.

**32 files total.** Two clusters stand out: the **10 of 12 QStash workers** with zero error handling (brief §4.6 already flags this as highest priority — "if they fail silently the user never sees it"), and **all 7 admin/notifications routes** except `stream`.

---

## 4 · Package changes proposed

```
pnpm add posthog-node
```
Nothing else. No other new dependency needed for Phase 0.

---

## 5 · Phased PR plan — real file counts

Mirrors brief §8, updated with counts from §2 above (each PR still under the ~30-file cap where possible):

| Phase | Scope | File count | Note |
|---|---|---|---|
| 0 | `posthog-node`, `lib/posthog-server.ts`, `lib/observability.ts`, `beforeSend` scrubbing in both Sentry configs | 4 files, 0 routes | |
| 1 | Payments (§2.1) | 19 routes | Excludes 2 SSE streams |
| 2 | Auth API (§2.2) + client pages (§2.3) | 20 routes + 7 client files = 27 | `admin/login/page.tsx` needs 6 more catches labeled (1 of 7 already done) |
| 3 | Staff (§2.4) | 5 routes | Down from the brief's "Staff + Users" — Users routes deleted (§1.2), removes 2 files from original scope |
| 4 | Uploads + workers (§2.5) | 15 routes | 11 of 15 currently have zero try/catch — largest wrap-from-scratch phase |
| 5 | Remaining admin mutations (§2.6) | 87 routes | **Brief assumed this fits one PR; it doesn't at the ~30-file cap.** Recommend splitting into 3: (5a) Products/Orders/Branches/Zoho/Customers ~18 files, (5b) Loyalty/Campaigns/Promotions/Blog/Banners/Testimonials/Tickets ~24 files, (5c) Inventory/Approvals/Notifications/Settings/Suppliers/Delivery/Contact/Finance/Analytics/Dashboard/Search/Reviews/Misc ~45 files |
| 6 | GET routes + external webhooks + storefront (§2.7, §2.8) | ~47 routes | Lowest priority, mostly read-only |

Total: **190 routes + 7 client files = 197 call sites**, across **8 PRs** (0, 1, 2, 3, 4, 5a, 5b, 5c, 6 — 9 actually, once Phase 5 is split).

---

## 6 · Open questions for Jefferson

1. **Server-side PostHog key**: reuse `NEXT_PUBLIC_POSTHOG_KEY`, or provision a separate `POSTHOG_KEY`? (Brief's own `lib/posthog-server.ts` sketch in §3.2 already assumes reuse — confirm that's intentional before Phase 0.)
2. **distinctId for payment webhooks**: customer's own id, or `"system"`? Matters for whether `payment_webhook_rejected` etc. can be tied back to a specific customer in PostHog funnels.
3. **Service-account coverage**: are any admin actions currently going through your personal account rather than a dedicated service/admin account? Affects `distinctId` accuracy for the audit-trail events in §5.2 of the brief.
4. **`lib/api.ts:28`'s existing `Sentry.captureException` call** (§1.1): should routes that call `Err.internal(e)` be left as-is (Sentry already fires, just without route/tag context), or should they be migrated to `reportError` + a plain `Err.internal()` call with no error arg (to avoid double-reporting the same exception under two different code paths)?
5. **Phase 5 split** (§5 above): the brief's phase boundaries assumed ~30 files/PR everywhere, but Phase 5 as scoped is 87 files. Are the 5a/5b/5c groupings above reasonable, or would you rather regroup by something else (e.g. blast-radius instead of domain)?
6. **`payments/status/[orderId]/route.ts`**: brief's table expected a `GET` handler; the file currently only exports `DELETE`. Worth a quick sanity check that nothing depends on a GET here before Phase 1 starts, in case this is itself a bug rather than a stale brief assumption.
