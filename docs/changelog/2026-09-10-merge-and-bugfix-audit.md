# 2026-09-10 — Client-Account: main merge + bug-fix audit

Branch: `Client-Account` (pushed to `origin/Client-Account`, not merged to the repo's `main`, not confirmed deployed to production).
HEAD at time of writing: `aa6b451` (2026-09-10 09:11:13 +0300).

This record covers two changes that landed back-to-back on this branch: a large merge of `main`, and a follow-up 9-file bug-fix session. It is a factual record only — no shippability verdict. That verdict is produced separately by the merge-review-orchestrator after collecting reports from other specialists (backend/migrations, security, and conflict re-verification).

## 1. Merge of `main` into `Client-Account`

Merge commit: `4260074` ("Merge pull request #20 from Kyfaru/main").
Range: `1695112d0ee09685096ee75da8ee32f3d5a9fe94..4260074`.
Diffstat: 617 files changed, 49,072 insertions(+), 10,677 deletions(-).

This range spans many prior PRs into `main` (visible via `git log --oneline 1695112..4260074`), not a single feature. Reading the actual commit messages, the functional intent groups into:

- **Payments and Zoho integration**: migration from Zoho Inventory to Zoho Books (`4203eb6` "Migrate Zoho integration from Inventory to Books", `850f408` "Integrate Zoho Books Locations and secure webhooks"), inventory adjustment fixes for Zoho's location-based tracking (`9148480`, `785bf1e`, `688f7f1` — removing double-decrement of stock), Paystack transaction handling and international address support for Zoho receipts (`325ff21`), KCB client logging/token handling (`9f122fa`, `10d1b3b`), and general Zoho webhook secret/character-limit fixes (`4ecb5b8`, `74fbbf8`, `6f4860f`).
- **In-store order management**: a full in-store order feature set — detail view, contact functionality, fulfillment panel (`59c3f10`), order contact/approval workflow with messaging templates (`eccd997`, `f1bf659`), order/customer statistics that integrate in-store data (`5284757`), SMS message builder for in-store invoices (`d2f3959`), and order-count/confirmation-modal accuracy fixes (`a4d34ae`, `7e4f5b1`).
- **Admin panel expansion**: role management and search updates (`f180a48`), admin audit logging, UTM attribution, and order deletion (`785be40`), admin activity logging plus exports and an approvals system (`ed4848d`, `1b14fd7` "implement approval request system for sensitive actions"), a Zoho item staging queue with in-store analytics (`79a883a`), developer-access bypass toggle (`740b449`), staff deletion/detail-editing improvements (`1d2bf2a`, `828b449`), and a persisted-filter hook for admin UI state (`0e8858d`).
- **Auth and security hardening**: Cloudflare Turnstile captcha integration (`99aed93`, `7a840d2`), cookie consent management (`bbbb50c`, `5d6299e`), improved error handling for admin login and API requests (`e39a8c6`), and a trusted-origins/secure-URL auth fix (`b56a60e`).
- **Storefront/UX polish**: product variants support (`2e95f74`), product card layout and description line-clamping (`7b0a00f`, `478457e`, `2f276ef`), product search and checkout-flow management (`018e098`), WhatsApp button in navbar (`2786c8a`), and a cart-icon design update (`d8c9b91`).
- **Infrastructure/deploy**: several Dockerfile fixes (openssl, curl, wget, `.dockerignore` for env files, Turnstile build args, Sentry/PostHog build args), a healthcheck endpoint added to `PUBLIC_PATHS` for Docker/Coolify compatibility (`c7500cd`), pnpm version pin (`bb48fdd`), and separation of observability imports for client/server modularity (`6e9ecd0`).
- **Schema**: `prisma/schema.prisma` was rewritten as part of this range (+1253/-820 lines per the branch's prior diffstat) to support the above — variants, in-store orders, Zoho Books mapping, approvals, staff/roles.

By directory, the heaviest touch points are `app/api` (212 files), `components/admin` (68), `app/admin` (21), `components/ui` (20), `components/account` (16), `lib/payments` (10), `lib/zoho` (8), `lib/reports` (8), `app/account` (8), with smaller touches across `lib/queries`, `lib/pdf`, `lib/orders`, `components/consent`, `lib/tickets`, `lib/notifications`, `lib/invoice`, `components/checkout`, `lib/paystack`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and `vercel.json`.

Two commits on top of the merge (`faa2f5b` self-merge, `aa6b451` bug-fix) bring the branch-wide diff (`1695112..aa6b451`) to 620 files changed, 49,147 insertions(+), 10,700 deletions(-).

**Note on scope vs. the pre-read summary**: the directory/feature list above is confirmed directly from commit messages in the merge range, not inferred. It substantially matches the pre-read briefing; the one addition worth flagging is the breadth of the Zoho Books migration specifically — it wasn't a single commit but a multi-commit effort (`4203eb6`, `850f408`, plus three follow-on inventory/location fixes), meaning more of the merge's surface area than a summary suggests is Zoho-integration-related.

## 2. Bug-fix session (9 files, live-site audit fixes)

Commits: `00f9391` ("fix: update page titles for consistency and clarity across the application"), `faa2f5b` (merge), `aa6b451` ("fix: standardize page titles and improve FAQ search visibility").
Range for isolated diff: `a4d34aef16205e3939ef32cdcfb87ea87b3e8129..aa6b451` (15 files changed, 104 insertions(+), 52 deletions(-) — 9 distinct source files since `main` did not touch these files in the interim).

| File | Fix |
|---|---|
| `components/shop/ShopClient.tsx` | Surfaces API errors to the user instead of silently rendering "no products found" on any failure. |
| `components/faq/FaqPageClient.tsx`, `app/faq/page.tsx` | Distinguishes "no FAQs exist" from "no search matches" as separate empty states. |
| `components/storefront/ProductDetailClient.tsx` | Scopes the "Other Products" section to the same category (was store-wide); fixes a React Query cache key that leaked state between different product detail pages; adds error handling; fixes the discount-badge guard from `!!product.compareAtPriceKes` to also require `compareAtPriceKes > priceKes` (prevents a false discount badge when compare-at price is set but not actually higher). |
| `components/storefront/ProductCard.tsx` | Same discount-badge guard fix as above, applied to the card component. |
| `app/about/page.tsx`, `app/contact/page.tsx`, `app/faq/page.tsx`, `app/shop/page.tsx`, `app/testimonials/page.tsx`, `app/shipping/page.tsx`, `app/terms/page.tsx`, `app/privacy-policy/page.tsx`, `app/blog/page.tsx` | Removed a hardcoded `" | Fechi Organics"` suffix from page titles that was being doubled by the root layout's title template. |
| `components/layout/Footer.tsx` | Currency switcher no longer renders both symbol and code redundantly (was showing "KShKSH" for the Kenyan Shilling option). |
| `components/admin/AdminProductsClient.tsx` | Added `refetchOnMount: "always"` and an `isFetching`-aware loading gate to the admin products list query. Needed because this app persists its React Query cache to `localStorage` across sessions (`app/providers.tsx`, `PersistQueryClientProvider`), and a stale/empty cached result was flashing "No products found" before real data loaded. |
| (direct DB edit, no file diff) | `fechi-male-fertility-tea` product description edited directly in the database, replacing unhedged health claims ("boost sperm count", "enhance male hormones") with disclaimer-bearing wellness language. |

## 3. Known risks (recorded verbatim, under separate specialist review)

- **Zoho description overwrite risk**: `fechi-male-fertility-tea` is mapped to a Zoho item via `productZohoMapping`, and `lib/zoho-sync.ts` unconditionally overwrites `product.description` from Zoho's own value on every sync. The health-claim fix applied directly to the DB will be silently reverted on the next Zoho sync/webhook unless the same fix is also applied in Zoho Books directly. This is a compliance-relevant regression risk, not just a technical note.
- **Migrations folder deleted**: the merge deleted all 14 files under `prisma/migrations/` plus `migration_lock.toml`, and the folder does not exist in the working tree at all post-merge. A backend specialist is separately investigating whether this is consistent with this project's known migration history (there is prior history of this repo alternating between `prisma db push` and `prisma migrate dev`, and the migrations folder has been absent before). No verdict is rendered here.
- **Four manually conflict-resolved files** during the merge (main's version taken, then bug-fixes re-applied on top): `app/shipping/page.tsx`, `app/testimonials/page.tsx`, `components/faq/FaqPageClient.tsx`, `components/storefront/ProductDetailClient.tsx`. These are being independently re-verified by other reviewers.
- **Pre-existing test failures**: approximately 9 vitest files / 57 tests failing due to Next.js 16's `connection()` API not being accounted for in the old test harness code. This is unrelated to, and not caused by, either the merge or the bug-fix session, and is excluded from this audit's scope.
