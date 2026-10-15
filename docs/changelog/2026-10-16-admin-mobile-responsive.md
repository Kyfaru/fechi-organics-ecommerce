# 2026-10-16 — Admin panel: mobile and tablet responsive pass

Branch: `staging`. Round 1 landed in `b17190f` (2026-10-15, 70 files, +541/-268). Round 2 landed in `2c80e65` (2026-10-16, 13 files, +410/-47). Neither is confirmed deployed.

Factual record of what changed, what was checked and what was not. The full spec is in `docs/admin-mobile-design-system.md`; this file does not repeat it.

## 1 · Summary

The admin panel was desktop-only: a fixed 264px sidebar, 480px drawers, 6-column tables and `px-6` gutters. Below 768px the sidebar was hidden with no replacement. This work adds a phone and tablet shell and adapts shared components. Desktop (>= 1024px) layout is unchanged.

| Width | Result |
|---|---|
| < 640px | Bottom tab bar, 56px header, full-page push drawers, card tables, bottom-sheet modals, filter sheet |
| 640-767px | Bottom tab bar, 72px header, side-panel drawers, card tables |
| 768-1023px | 72px icon rail, tables |
| >= 1024px | Unchanged |

**Not tested in a browser or on a device.** See §5.

## 2 · Round 1 — `b17190f`

| Area | Change | Evidence |
|---|---|---|
| Sidebar | Below `md`: fixed bottom tab bar (Home, Orders, Products, Customers, More) filtered by permission. `md`-`lg`: 72px icon rail. More opens the existing nav in a left drawer, `min(300px, 85vw)`. Esc, scrim, nav click and route change close it; body scroll locks. | `components/admin/AdminSidebar.tsx:29-34,89,164-227` |
| Header | `h-14` on phones, `sm:h-[72px]`. Hamburger below `md`. Search collapses to an icon that opens a full-width overlay. Export, WhatsApp and Settings icons hidden below `sm`. | `components/admin/AdminHeader.tsx:62-137` |
| Notification bell | Dropdown becomes a fixed panel inset 12px below `sm`. | `components/admin/NotificationBell.tsx` |
| Footer | Stacks in a column below `sm`; also fixed a stray `gaspan-1` class. | `components/admin/AdminFooter.tsx` |
| Main content | `pb-[calc(3.5rem+env(safe-area-inset-bottom))]` below `md` so the bar never covers content; `overflow-x-clip`. | `app/admin/(protected)/layout.tsx:22` |
| Drawer | Phones: full-page push via portal, back chevron, page behind shifts 22% and fades. `sm`+: spring side panel as before. Counter on `body[data-drawer-open]` supports nesting. | `components/admin/ui/Drawer.tsx`, `app/globals.css:383-392` |
| Page transition | New `template.tsx` wraps routes in `.admin-page-enter` (0.28s). | `app/admin/(protected)/template.tsx`, `globals.css:394-408` |
| DataTable | New prop `mobile: "cards" \| "scroll"`, default `"cards"`. Below `md` rows render as cards. Selection toolbar preserved. | `components/admin/ui/DataTable.tsx:34,106-165` |
| PageHeader, StatCard | Gutters `px-4 sm:px-6`; titles 22px (28px from `sm`); stat value 20px (28px from `sm`). | `PageHeader.tsx`, `StatCard.tsx` |
| ConfirmModal | Bottom sheet below `sm`, buttons stacked. | `components/ui/ConfirmModal.tsx:33-47` |
| Inline modals | New `.admin-overlay` class: sheet-up on phones. Applied to Staff (5), Approvals, Profile re-verify, Orders. | `globals.css:410-419` |
| Codemod sweep | ~58 files: `px-6` to `px-4 sm:px-6`; `w-[Npx]` to `w-full sm:w-[Npx]`; `grid-cols-2` to `grid-cols-1 sm:grid-cols-2`; large headings scaled. | `git show --stat b17190f` |
| Tickets | List and thread become two screens below `md` with a back button; customer-info column hidden below `xl`. | `components/admin/AdminTicketsClient.tsx:480,562,742` |
| Settings, Profile | Tab list becomes a horizontal scroll strip below `md`. | `AdminSettingsClient.tsx:782`, `AdminProfileClient.tsx:698` |
| Orders drawer | Two-column detail stacks below `sm`; 180px side column becomes full width. | `AdminOrdersClient.tsx` |

## 3 · Round 2 — `2c80e65`

| Area | Change | Evidence |
|---|---|---|
| MobileFilterSheet | New component. One icon button with active-count badge opens a full-page Drawer. Group types `single`, `multi`, `range`, `date`. Edits are drafted and committed on Apply. | `components/admin/ui/MobileFilterSheet.tsx` (170 lines) |
| Wiring | Orders, Products, Inventory, Activity, Notifications. Desktop controls stay, wrapped in `contents max-sm:hidden`. | `git show 2c80e65 --stat` |
| New filters | Orders: order total range (`o.totalKes`). Products: price range (`p.priceKes`). Both apply at every width, but only the phone sheet exposes them. | `AdminOrdersClient.tsx` `totalRange`, `AdminProductsClient.tsx` `priceRange` |
| Icons | `ProductPlusIcon`, `ZohoIcon`, `ZohoSyncIcon`, `ZohoListIcon`, `ZohoArchiveIcon`. | `components/admin/ui/icons.tsx` |
| Icon-only actions | Products header (sync, reviews, Zoho products, expelled), Inventory sync, Orders export, Notifications mark-all-read. Text kept as `sr-only`. | per-page diffs |
| FAB | Create Order and Add Product become a 56px round button at `bottom-[4.75rem] right-4 z-30` below `sm`. | `AdminOrdersClient.tsx:1691`, `AdminProductsClient.tsx` |
| PageHeader | Always a row; buttons and links containing an `svg` collapse to a 40px icon below `sm`. Supersedes the round-1 `flex-1` action row. | `PageHeader.tsx:29-43` |
| Roles | Below `md`: one card per resource listing each role's grants. Matrix hidden. | `AdminRolesClient.tsx:111-141` |
| Raw tables | New `.admin-stack-table`: header hidden, rows stacked, last cell pinned top-right. Branches (2 tables), Campaigns recipients. | `globals.css:421-430` |
| More > Advanced | Collapsible group, phones only: Shipping, Order tracking, Product categories, Product Q&A, Zoho products, Delivery zones, Roles & permissions. | `AdminSidebar.tsx:19-27,323-342` |

## 4 · Behaviour changes that are not only visual

1. Orders and Products gain price/total range filtering (§3). On desktop nothing exposes it, so it is dormant there.
2. The two range states use `useState`, not `usePersistedFilter`. They reset on reload.
3. Every `DataTable` consumer switched to cards below 768px without a code change. A page that relied on horizontal scroll at that width now shows cards and loses column sorting.
4. Order status filter in the phone sheet is single-select. Unchanged from desktop.
5. Tickets list now fills the screen below `md`; selecting a ticket sets `mobileChat` and shows the thread. `activeTicketId` is unchanged, so desktop is unaffected.

## 5 · Verification

| Check | Result |
|---|---|
| `git status`, `git log`, `git show --stat` for both commits | Done 2026-10-16 |
| Class names, px values, paths and hrefs in the spec | Read from source at HEAD |
| `pnpm exec tsc --noEmit` | Passed: exit 0, zero errors, unfiltered (re-run 2026-10-16) |
| ESLint on changed files | Clean, reported by the change author |
| `pnpm vitest run` | 9 files / 57 tests fail; same baseline as before this work (route-handler tests not updated for Next 16 `connection()`) |
| Browser at 360 / 390 / 430px | **Not done** (admin requires login) |
| Browser at 768px and 1280px | **Not done** |
| Real device (iOS Safari, Android Chrome) | **Not done** |

## 6 · Known gaps

| Gap | Detail |
|---|---|
| Untested on screen | Every phone behaviour above is per the code, not observed. |
| Orphan pages | `/admin/transactions` and `/admin/users` have no inbound link. |
| Broken links (pre-existing) | `/admin/finance/payment-methods` (`AdminSettingsClient.tsx:346`) and `/admin/support` (`AdminDashboardClient.tsx:634`) point at routes that do not exist. |
| Tickets | Customer-info pane hidden below `xl`, so tablets under 1280px also lose it. `hidden xl:flex` sits next to a bare `flex`; CSS order unverified. |
| Products bulk bar | `fixed bottom-0 z-30` equals the tab bar position and z-index; likely overlaps. Unverified. |
| Not individually reworked | Blog editor, RichTextEditor, ScheduleModal (still a centred dialog), Testimonials, Delivery zones, Settings Advanced-tab hiding. Planned, not done. |
| Advanced links | Hand-maintained and not permission-filtered; a role without access sees an in-place 403. |
| FAB | Duplicated utility string in two files; no shared component. |
| Icon-only header buttons | Customers "Support Tickets" collapses to a ticket glyph with no `aria-label`; the text remains in the DOM only. |
| Unrelated working-tree change | `app/admin/login/page.tsx` was modified and uncommitted when this file was written. Not part of this work. |

## 7 · Follow-ups

1. Walk Orders, Products, Inventory, Customers and Tickets at 360, 390, 430 and 768px with an admin session. Record results in §5 of `docs/admin-mobile-design-system.md`.
2. Regression-check desktop at 1280px.
3. Fix or remove the two broken links; decide on the orphan pages.
4. Extract a shared `<Fab>` and add `aria-label` to icon-collapsed `PageHeader` actions that lack one.
5. Rework Blog editor, ScheduleModal, Delivery zones and Settings (hide Advanced tabs on phones).
6. Persist the new range filters with `usePersistedFilter` if staff expect them to survive reload.
