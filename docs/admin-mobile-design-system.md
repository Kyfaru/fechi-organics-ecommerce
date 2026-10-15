# Admin mobile and tablet design system

Audience: developers working on `components/admin/**` and `app/admin/**`. Last verified against the working tree on 2026-10-16 (HEAD `2c80e65`).

Scope: how the admin panel adapts below desktop width, which tokens and components it uses, which pages were reworked and which were not, and what is still unverified. Desktop layout (>= 1024px) is intentionally unchanged except where §5 says otherwise.

Evidence format is `file:line` against HEAD. Round 1 is commit `b17190f` (2026-10-15). Round 2 is commit `2c80e65` (2026-10-16). Both are on branch `staging`.

---

## 1 · Goals, non-goals and phone scope

**Goal.** A staff member on a phone can finish the daily duties without opening a laptop:

| Core duty | Where it lives on a phone |
|---|---|
| Review and update orders | Bottom bar > Orders |
| Create an in-store order | Floating action button on the Orders page, or `/admin/orders/new` |
| Look up a customer, open a ticket | Bottom bar > Customers, then Support Tickets link |
| Approve requests | More > Approvals |
| Check products and stock | Bottom bar > Products, More > Inventory |
| Reply to support tickets | `/admin/customers/tickets` (single pane, see §6) |

Deep or rarely used pages stay reachable but are not promoted: More > **Advanced** lists Shipping, Order tracking, Product categories, Product Q&A, Zoho products, Delivery zones and Roles & permissions (`AdminSidebar.tsx:19-27`).

**Non-goals.**

- No new routes, no phone-only pages. Every phone screen is the same route as desktop.
- No change to API contracts, permissions or data model.
- No native-app behaviour (no PWA manifest, no offline mode) was added.
- Authoring-heavy screens (blog editor, rich text, campaign composer, spreadsheet-style exports) are not optimised for phones. See §8.

**Phone breakpoint.** Phone means viewport width below 640px (Tailwind `sm`). Several components switch at `md` (768px) instead. §2 lists each switch point.

---

## 2 · Devices, breakpoints and what was tested

### 2.1 Breakpoints used

| Width | Tailwind | Shell | Tables | Drawer |
|---|---|---|---|---|
| < 640px | base | Bottom tab bar + More drawer, 56px header (`h-14`) | Cards | Full-page push |
| 640-767px | `sm` | Bottom tab bar + More drawer, 72px header | Cards | Side panel (480/640px) |
| 768-1023px | `md` | Icon rail 72px, no bottom bar | Table | Side panel |
| 1024-1279px | `lg` | Full sidebar 264px (or 72px if collapsed) | Table | Side panel |
| >= 1280px | `xl` | Same as `lg`; Tickets third column appears | Table | Side panel |

Switch points that are not `sm`:

| Behaviour | Breakpoint | Evidence |
|---|---|---|
| Bottom tab bar shown, sidebar hidden | `< md` | `AdminSidebar.tsx:150,166` |
| DataTable card mode | `< md` | `DataTable.tsx:107,166` |
| Roles card view | `< md` | `AdminRolesClient.tsx` (`md:hidden` / `max-md:hidden`) |
| Tickets single pane | `< md` | `AdminTicketsClient.tsx:480,562` |
| Settings and Profile tab strip scrolls horizontally | `< md` | `AdminSettingsClient.tsx:782`, `AdminProfileClient.tsx:698` |
| Hamburger visible | `< md` | `AdminHeader.tsx:66` |
| Icon rail forced (sidebar collapsed, toggle hidden) | `<= 1023px` | `AdminSidebar.tsx:89` |
| Tickets customer-info column | `>= xl` | `AdminTicketsClient.tsx:742` |

### 2.2 What was actually tested

| Check | Result | Notes |
|---|---|---|
| `pnpm exec tsc --noEmit` | Passed: exit 0, no errors (re-run 2026-10-16) | Unfiltered, whole project |
| ESLint on changed files | Passed | Reported by the change author; not re-run for this document |
| `pnpm vitest run` | Baseline only: 9 files / 57 tests fail | Pre-existing, unrelated: the route-handler tests were never updated for Next 16 `connection()` |
| Browser at 360, 390, 430px (phone) | **Not done** | Admin requires login; no authenticated session was available |
| Browser at 768px (tablet portrait) | **Not done** | Same reason |
| Browser at 1280px (desktop regression) | **Not done** | Same reason |
| Real iOS Safari / Android Chrome | **Not done** | Safe-area insets, `100dvh`, and `position: fixed` inside transformed parents are only verifiable on device |

Treat every phone behaviour in this document as "implemented per the code", not "observed working". The pending list is in §10.3.

---

## 3 · Design tokens

All tokens are CSS custom properties on `:root` in `app/globals.css:63-80`. Components reference them with Tailwind v4 arbitrary-value syntax, for example `bg-(--green-800)`. Dark mode uses the `dark:` variant bound to the `.dark` class (`globals.css:6`).

### 3.1 Colour

| Token | Value | Typical use in the mobile work |
|---|---|---|
| `--green-900` | `#103D0C` | Sidebar / More drawer background |
| `--green-800` | `#1F6F18` | Primary button, FAB, filter count badge, Apply button, active tab |
| `--green-500` | `#43A935` | Focus ring, StatCard left border |
| `--green-50` | `#EFFBEA` | Drawer header fill, hover/pressed rows |
| `--gold-500` | `#FFC800` | Active-item marker in the More drawer |
| `--neutral-900` | `#0F2D0B` | Body text |
| `--neutral-500` | `#3F7437` | Secondary text, inactive tab |
| `--neutral-200` | `#BFE8B4` | Borders, dividers |
| `--neutral-50` | `#F2FBEF` | Page background |
| `--danger` / `--danger-bg` | `#D64545` / `#FBEDED` | Destructive confirm icon |
| `--dark-bg` | `#120E08` | Dark page background |
| `--dark-surface` | `#1E170C` | Dark cards, header, bottom bar |
| `--dark-border` | `#4A3210` | Dark dividers |
| `--dark-text` / `--dark-muted` | `#FFF7DF` / `#D6B86F` | Dark text |
| `--dark-accent` | `#FFC800` | Dark active tab, dark back button |

Two literal colours sit outside the tokens: WhatsApp `#25d366` (`AdminHeader.tsx:144`) and the sign-out red `#ff4545` (`AdminSidebar.tsx:369`).

### 3.2 Type

| Role | Family | Size on phone | Size from `sm` | Evidence |
|---|---|---|---|---|
| Page title (h1) | Syne (`font-syne`) | 22px | 28px | `PageHeader.tsx:32` |
| Page description | DM Sans (`font-dm`) | 13px | 15px | `PageHeader.tsx:34` |
| Stat value | Syne bold | 20px | 28px | `StatCard.tsx:21` |
| Drawer title | Syne semibold | 16px | 18px | `Drawer.tsx:81` |
| Bottom tab label | DM Sans medium | 11px | n/a (`md` hides bar) | `AdminSidebar.tsx:175` |
| Card row title | DM Sans semibold | 14px | n/a | `DataTable.tsx:143` |
| Card row label (`dt`) | DM Sans, uppercase | 11px | n/a | `DataTable.tsx:155` |
| Card row value (`dd`) | DM Sans | 13px | n/a | `DataTable.tsx:156` |
| Search input | DM Sans | 16px | 14px | `AdminHeader.tsx:105` |
| Date input in filter sheet | DM Sans | 16px | n/a | `MobileFilterSheet.tsx` |

The 16px input size is deliberate: iOS Safari zooms the page when a focused input is below 16px.

### 3.3 Radius and elevation

| Token | Value | Used by |
|---|---|---|
| Card radius | 12px | DataTable, StatCard, toolbars |
| Control radius | 8px (buttons), 10px (icon buttons, inputs in sheet) | Filter button, Apply/Reset |
| Sheet top radius | 16px | ConfirmModal on phones (`ConfirmModal.tsx:35`) |
| FAB radius | full (`rounded-full`) | Create Order, Add Product |
| `--e1` | `0 1px 2px rgba(16,20,14,0.05)` | Cards, header |
| `--e2` | `0 4px 12px rgba(16,20,14,0.08)` | Focused search |
| `--e3` | `0 12px 32px rgba(16,20,14,0.12)` | Drawer, ConfirmModal, bulk bar |

### 3.4 Sizes and spacing

| Item | Phone value | Evidence |
|---|---|---|
| Touch target, icon button | 40px (`w-10 h-10`), sheet rows `min-h-12` (48px), Apply/Reset `h-12` | `MobileFilterSheet.tsx` |
| Page gutter | 16px (`px-4`), 24px from `sm` (`sm:px-6`) | codemod, ~58 files |
| Header height | 56px (`h-14`), 72px from `sm` | `AdminHeader.tsx:62` |
| Bottom tab bar | 56px (`h-14`) + `env(safe-area-inset-bottom)` | `AdminSidebar.tsx:166,175` |
| Main bottom padding | `calc(3.5rem + env(safe-area-inset-bottom))` below `md` | `layout.tsx:22` |
| More drawer width | `min(300px, 85vw)` | `AdminSidebar.tsx:206` |
| FAB | 56px (`w-14 h-14`), `bottom: 4.75rem` (76px), `right: 1rem`, `z-30` | `AdminOrdersClient.tsx`, `AdminProductsClient.tsx` |
| Filter count badge | min 18px circle | `MobileFilterSheet.tsx` |
| Sidebar width | 264px full, 72px rail | `AdminSidebar.tsx:150`, `globals.css:80` |

### 3.5 Motion

| Motion | Spec | Evidence |
|---|---|---|
| Full-page drawer (phone) | Tween 0.32s, `cubic-bezier(0.32, 0.72, 0, 1)` | `Drawer.tsx:53` |
| Side-panel drawer (sm+) | Spring, stiffness 420, damping 38 | `Drawer.tsx:54` |
| Page behind a drawer | `translateX(-22%)`, opacity 0.55, 0.32s | `globals.css:387-392` |
| Route change | `admin-page-in`, 0.28s; slides from 24px right on phones, 8px up from `sm` | `globals.css:397-407` |
| Inline modal | Fade 0.18s + sheet-up 32px, 0.26s | `globals.css:411-413` |
| More drawer | Tween 0.2s from the left | `AdminSidebar.tsx:204` |
| Reduced motion | All of the above disabled under `prefers-reduced-motion: reduce` (Drawer via `useReducedMotion`) | `globals.css:393,408,419` |

---

## 4 · Shell spec

Component tree: `app/admin/(protected)/layout.tsx` renders `AdminSidebar`, then `<main>` containing `AdminHeader`, the page, and `AdminFooter`. The root div carries `.admin-shell`, which the push animation targets (`globals.css:384`).

### 4.1 Header (`AdminHeader.tsx`)

| Element | < 640px | 640-767px | >= 768px |
|---|---|---|---|
| Height | 56px | 72px | 72px |
| Hamburger (opens More drawer via `admin:open-nav` event) | Shown | Shown | Hidden |
| "Fechi Admin" label | Shown | Hidden | Hidden |
| Greeting + date | Hidden | Hidden | Hidden below `lg` |
| Search | Icon; tap opens full-width overlay with close button | Inline field | Inline field |
| Export icon, WhatsApp, Settings link | Hidden | Shown | Shown |
| Theme toggle, notification bell, avatar | Shown | Shown | Shown |

The notification dropdown becomes a fixed panel inset 12px from both edges, top 3.75rem, below `sm` (`NotificationBell.tsx`).

### 4.2 Bottom tab bar (below `md`)

Tabs, in order (`AdminSidebar.tsx:29-34`): Home (`/admin`, exact match), Orders, Products, Customers, then More. A tab renders only when its `href` is in the permission-filtered nav (`AdminSidebar.tsx:168`). A role without `orders` view therefore sees no Orders tab.

More opens the same drawer as the header hamburger. The drawer closes on Escape, on scrim tap, on any nav click, and on route change (`AdminSidebar.tsx:102-117`). Body scroll is locked while it is open.

### 4.3 More drawer

Renders `SidebarContent` with `mobile` set. Contents, top to bottom: logo, permission-filtered nav groups (STORE, OPERATIONS, MARKETING, CONTENT, ANALYTICS, SETTINGS), a collapsible **Advanced** group (phones only, `AdminSidebar.tsx:323`), Activity Log and Error Logs (admin and super-admin only), Sign out.

Advanced links are **not** permission-filtered in the sidebar. The route guard still returns 403 for a role without access (`layout.tsx` `AdminGuard`), so a link can lead to an in-place 403 page.

### 4.4 Tablet rail (768-1023px)

The sidebar renders at 72px with icons only and `title` tooltips. The collapse toggle is hidden because `tablet` forces the rail (`AdminSidebar.tsx:378`). The user's saved collapsed preference (`localStorage` key `adminSidebarCollapsed`) still applies from `lg`.

### 4.5 Content width

`<main>` margin: `md:ml-[72px] lg:ml-[var(--sidebar-w,264px)]`; `overflow-x-clip` prevents a wide child from creating page-level horizontal scroll (`layout.tsx:22`).

---

## 5 · Component reference

### 5.1 Drawer (`components/admin/ui/Drawer.tsx`)

Role: slide-over panel for detail and edit views. Used by Orders, Products, Inventory, Customers and others.

| Prop | Type | Default | Notes |
|---|---|---|---|
| `open` | `boolean` | required | |
| `onClose` | `() => void` | required | Called on Escape, scrim click (sm+), Back/Close button |
| `title` | `string` | required | Header text and `aria-label` |
| `children` | `ReactNode` | required | Scrolls in `overflow-y-auto overscroll-contain` |
| `footer` | `ReactNode` | none | Sticky; respects `safe-area-inset-bottom` |
| `width` | `480 \| 640` | `480` | Applies from `sm` only; phones are always full width |

What changed in round 1:

- Phones: full-page screen, header shows a back chevron, no scrim (`max-sm:hidden` on the scrim).
- sm+: unchanged right-hand panel; close "X" button shown.
- Rendered through `createPortal` to `document.body`, so ancestors with `transform` cannot trap it. It returns `null` until mounted on the client.
- A counter on `body[data-drawer-open]` supports nested drawers. CSS shifts `.admin-shell > main` left 22% only below 640px.
- Escape closes it; `body.style.overflow` is locked and restored.

Why: the previous 480px side panel was wider than most phones and left no obvious way back.

Customise: change the push distance and fade in `globals.css:387-392`; change timing in `Drawer.tsx:50-54`.

### 5.2 MobileFilterSheet (`components/admin/ui/MobileFilterSheet.tsx`, new in round 2)

Role: single phone entry point for a page's filters. One 40px icon button with a count badge opens a full-page Drawer.

```tsx
<MobileFilterSheet
  title="Filters"            // optional, default "Filters"
  groups={[
    { type: "single", key: "status", label: "Status", value, onChange, options, allLabel: "All statuses" },
    { type: "multi",  key: "areas",  label: "Areas",  value: string[], onChange, options },
    { type: "range",  key: "price",  label: "Price",  value: { min, max }, onChange },
    { type: "date",   key: "date",   label: "Date range", from, to, onChange: (from, to) => {} },
  ]}
/>
```

| Group type | Control | Empty value | Counted as active when |
|---|---|---|---|
| `single` | Radio list with a leading "All" row (`allLabel`, default "All") | `""` | `value !== ""` |
| `multi` | Checkbox list | `[]` | `value.length > 0` |
| `range` | `PriceRangeSlider` (10-100,000 KES, banded steps) | `FULL_RANGE` | `min > PRICE_MIN` or `max < PRICE_MAX` |
| `date` | Two native `type="date"` inputs | `from=""`, `to=""` | either set |

Behaviour:

- Edits go to a local draft. Page state changes only when the user taps **Apply**; **Reset** clears the draft but still needs Apply.
- Drawer unmounts its children when closed, so the draft re-seeds from live state on every open (`MobileFilterSheet.tsx` comment at `SheetBody`).
- The trigger is `sm:hidden`. Desktop controls stay in the DOM wrapped in `<div className="contents max-sm:hidden">`, so there is one source of filter state, not two.
- Count badge and `aria-label` ("Filters (3 active)") come from `activeCount`.

Wired into:

| Page | Groups |
|---|---|
| Orders | Status, Payment, Channel, Date preset, Custom date range, **Order total (new)**, Branch (super admin only) |
| Products | Category, Status, Sort by, **Price (new)** |
| Inventory | Category, Stock status |
| Activity | Severity, Areas (multi), Date range |
| Notifications | Date range, Custom dates, Category, Branch (global tier), Severity (multi) |

The two range filters are new behaviour on all widths, not only phones: Orders filters on `o.totalKes`; Products on `p.priceKes`. They are held in `useState`, not `usePersistedFilter`, so they reset on reload. The desktop toolbar has no control for them, so on desktop they stay at full range.

Customise text: `title` prop, each group's `label`, `allLabel`, and the literal "Reset" / "Apply" in `SheetBody`. Customise a new page: add a `groups` array and hide the desktop toolbar controls with the `contents max-sm:hidden` wrapper.

### 5.3 DataTable card mode (`components/admin/ui/DataTable.tsx`)

New prop: `mobile?: "cards" | "scroll"`, default `"cards"` (`DataTable.tsx:34,48`). Every existing consumer therefore became card mode below `md` without code changes.

How a row maps to a card:

- **Title** = the first column that is not an action column.
- **Action cell** = any column with an empty label or key `actions`; rendered top-right, clicks do not trigger `onRowClick`.
- **Body** = remaining columns as a two-column `dl` of label/value pairs.
- Selection checkbox and the "N selected" toolbar are preserved.
- Loading shows 4 skeleton rows; empty state reuses `EmptyState`.

Use `mobile="scroll"` for a table that is only legible as a grid. No call site passes it today (`grep 'mobile="scroll"'` returns nothing).

Limitation: sorting controls exist only in the desktop header, so card mode cannot sort.

### 5.4 PageHeader (`components/admin/ui/PageHeader.tsx`)

| Aspect | Round 1 | Round 2 |
|---|---|---|
| Padding | `px-4 sm:px-6 pt-4 sm:pt-6` | same |
| Breadcrumb | One line, horizontal scroll | same |
| Title/description | 22/13px phone, 28/15px sm+ | same |
| Layout | Column on phone, row on sm+ | Row at every width |
| `action` slot | Wraps, children `flex-1` on phone | Buttons and links that contain an `svg` collapse to icon-only on phone |

The collapse is pure CSS (`max-sm:[&_:is(button,a):has(svg)]:text-[0px]`, 40px minimum size). Text stays in the DOM, but because it relies on `font-size: 0`, **a button should also carry an `aria-label`** to be safe. Orders, Products and Notifications do.

Rule for authors: give an action button a lucide icon if you want it to become icon-only on phones; a text-only button keeps its label.

### 5.5 StatCard (`components/admin/ui/StatCard.tsx`)

Padding `p-4 sm:p-6`, value 20px phone / 28px sm+, icon chip 32px phone / 40px sm+. Grids that hold cards use `grid-cols-2` on phones (for example Orders stats, `grid-cols-2 lg:grid-cols-4`).

### 5.6 ConfirmModal and `.admin-overlay` (`components/ui/ConfirmModal.tsx`, `globals.css:410-419`)

- **ConfirmModal**: bottom sheet below `sm` (`inset-x-0 bottom-0`, 16px top radius, safe-area bottom padding); centred 480px dialog from `sm`. Buttons stack with the primary action on top (`flex-col-reverse`), `h-11` each.
- **`.admin-overlay`**: add the class to the fixed overlay of any hand-built modal. Below 640px its first child becomes full width, loses side margin and bottom radius, caps at `92dvh` and scrolls. Pair it with `items-end sm:items-center` on the overlay. Applied to Staff (5 modals), Approvals, Profile re-verify and Orders inline modals in round 1.

`!important` is used in the phone rule so it wins over each modal's own `max-w-*` and `mx-*` classes.

### 5.7 Raw tables: `.admin-stack-table` (`globals.css:421-430`, round 2)

For hand-written `<table>` elements that do not use DataTable. Add the class to the `<table>`. Below 640px it hides `<thead>`, shows each `<tr>` as a flex column card, and pins the **last** `<td>` top-right (reserve action buttons for the last cell; the first cell gets 40px right padding).

Applied to: Branches (2 tables), Campaigns recipients table. Limitation: header labels disappear, so cells must be self-explanatory.

### 5.8 Icons (`components/admin/ui/icons.tsx`, round 2)

| Export | Composition | Used for |
|---|---|---|
| `ZohoIcon` | Inline SVG brand mark (no network fetch) | Base for the three below |
| `ZohoSyncIcon` | Zoho + refresh badge | Sync with Zoho (Products, Inventory) |
| `ZohoListIcon` | Zoho + checklist badge | Zoho Products |
| `ZohoArchiveIcon` | Zoho + archive badge | Expelled Zoho Products |
| `ProductPlusIcon` | Package + plus badge | Add Product |

All take `size` (default 20). Badge is 60% of base size, white circle, bottom-right. To add a variant: `export const XIcon = ({ size }) => <Badged base={LucideIcon} badge={Plus} size={size} />`. Icons are `aria-hidden`; the button supplies the label.

Pattern used at call sites: keep the original desktop icon, hide it below `sm` (`max-sm:hidden`), and show the composite icon in a `sm:hidden` span.

### 5.9 Floating action button

No shared component. Two call sites repeat the same utility string (`AdminOrdersClient.tsx` Create Order, `AdminProductsClient.tsx` Add Product):

```
max-sm:fixed max-sm:bottom-[4.75rem] max-sm:right-4 max-sm:z-30
max-sm:w-14 max-sm:h-14 max-sm:rounded-full max-sm:shadow-lg max-sm:px-0 max-sm:justify-center
```

Label text uses `max-sm:sr-only` and `aria-label`. 4.75rem = 56px bottom bar + 20px gap.

To change position or size, edit both call sites; extracting a `<Fab>` component is listed in §8.

---

## 6 · Page-by-page

"Reworked" means a phone-specific behaviour exists in the code. "Padding only" means the codemod adjusted gutters and grids but nothing page-specific was done.

| Page | Status | Kept | Cut / hidden on phone | Moved | Decision and reason | Phone capabilities (per code) |
|---|---|---|---|---|---|---|
| Orders | Reworked | List, status, payment, drawer, export | Inline filter row (collapsed into sheet) | Filters into MobileFilterSheet; Create Order into FAB | Seven filters do not fit in 360px; sheet keeps them reachable | Search, filter (adds order total), open order in full-page drawer (columns stack), create order, export. In-store orders appear in the same list |
| Products | Reworked | List, bulk select, drawer | Inline category/status/sort selects | Filters into sheet; Add Product into FAB; header buttons to icon-only | Header held five labelled buttons | Search, filter (adds price), edit in drawer, add, sync Zoho, reviews, Zoho staging |
| Inventory | Reworked | Table/cards, sync | Inline category/status selects | Into sheet | Same as Products | Search, filter, sync with Zoho, adjust in drawer |
| Customers | Padding only | List, drawer | None | None | Cards from DataTable are sufficient for lookup | Search, open customer, jump to Support Tickets |
| Tickets | Reworked | List, thread, reply | Customer-info column (below `xl`) | List and thread become two screens | One pane at a time; back chevron returns to list | Read, reply, assign, filter (inline) |
| Settings | Partial | All tabs | None | Tab list becomes horizontal strip | Strip scrolls; tab content only had padding/grid changes | Edit settings. Advanced-tab hiding: **planned, not done** |
| Profile | Partial | All tabs | None | Same strip as Settings | Same | Edit profile, preferences, password |
| Delivery zones | Padding only | Everything | None | Link under More > Advanced | **Planned**: no phone layout for the zones editor | View list; editing is as on desktop |
| Blog list | Padding only | Everything | None | None | Planned | Browse posts |
| Blog editor / RichTextEditor / ScheduleModal | Padding only | Everything | None | None | **Planned, not done.** ScheduleModal is still a centred dialog (`p-4 sm:p-6`, one-column grid) | Not recommended on phone |
| Testimonials | Padding only | Everything | None | None | Planned | Browse, moderate |
| Loyalty / Points | Padding only | Everything | None | None | Planned | View balances and lists; grants and flags are super-admin screens |
| Roles | Reworked | Matrix on desktop | Matrix grid (below `md`) | Replaced by per-resource cards | A permission matrix cannot scroll usefully on a phone | Read-only view of what each role can do per resource |
| Branches | Reworked (CSS) | Both tables | Table header row | Rows stack as cards | `.admin-stack-table` | Read branches and organisations |
| Campaigns | Partial | List, composer | Recipients table header | Recipient rows stack | Composer not reworked | Read campaigns and recipients |
| Activity | Reworked | Feed, search | Date, severity, area controls | Into sheet | Three controls + clear did not fit | Search, filter by severity, area, date |
| Notifications | Reworked | Feed | Filter sidebar (below `sm`) | Into sheet; Mark all read icon-only | Sidebar pushed the feed below the fold | Filter, mark all read, open item |
| Staff | Partial | Table, modals | None | Modals become bottom sheets | Padding and `.admin-overlay` only | Invite/edit/deactivate via sheets |
| Approvals | Partial | List, decision modal | None | Modal becomes bottom sheet | Padding and `.admin-overlay` | Approve or reject |

Not individually reworked in either round: Analytics, Finance, Transactions, Suppliers, Promotions, FAQs, Banners, Homepage content, Security, Product Q&A, Product reviews, Shipping, Tracking. They inherit the shell, gutters and DataTable cards only.

---

## 7 · What a phone user can do and what needs desktop

| Task | Phone | How to reach it |
|---|---|---|
| Find and update an order | Yes | Bottom bar > Orders > filter icon |
| Create an in-store order | Yes | Orders > green FAB |
| Look up a customer | Yes | Bottom bar > Customers |
| Reply to a ticket | Yes | Customers > Support Tickets (also needs desktop to see customer info below `xl`) |
| Approve a request | Yes | More > Approvals |
| Edit a product or stock | Yes | Products, Inventory |
| Sync from Zoho | Yes | Icon button in Products / Inventory header |
| Change shipping, tracking, categories, Q&A, delivery zones, roles | Yes, with a long-tap path | More > Advanced |
| Export data | Partial | Orders has an Export icon; the global header export icon is hidden below `sm` |
| Write or schedule a blog post | Not optimised | Use desktop |
| Review a permission matrix | Cards only | Roles page; edit on desktop |
| Compose a campaign | Not optimised | Use desktop |
| Analytics and finance dashboards | Opens, unreviewed | Use desktop for charts |

---

## 8 · Limitations and known gaps

1. **No device or browser testing yet** (§2.2). Layout bugs at 360px are likely until someone walks every page.
2. **Orphan pages.** `/admin/transactions` and `/admin/users` are registered in `lib/admin-nav.ts:78-79` but nothing in `components/` or `app/` links to them (grep for `href` and `router.push`). They are reachable only by typing the URL.
3. **Broken links.** `/admin/finance/payment-methods` (`AdminSettingsClient.tsx:346`) and `/admin/support` (`AdminDashboardClient.tsx:634`) point at routes that do not exist under `app/admin/(protected)/`. Both 404 (or 403 via the fail-closed guard). Not caused by this work; fix separately.
4. **Tickets customer-info pane** is `hidden xl:flex` (`AdminTicketsClient.tsx:742`), so customer details are unavailable on phones and on tablets narrower than 1280px. The same element also has a bare `flex` class; whether `hidden` wins depends on generated CSS order and needs a browser check.
5. **Order status filter is single-select.** The Orders sheet offers one status at a time. Desktop is also single-select; there is no multi-status view on any width.
6. **Range filters are not persisted** and have no desktop control (§5.2).
7. **Products bulk-action bar** is `fixed bottom-0 ... z-30` (`AdminProductsClient.tsx:1503`), the same position and z-index as the bottom tab bar. It probably paints over the tabs while rows are selected. Unverified.
8. **FAB inside a transformed ancestor.** The FAB sits in the PageHeader action slot, inside `.admin-page-enter`. The animation ends at `transform: none`, so `position: fixed` resolves to the viewport afterwards, but it is relative to the animated wrapper during the 0.28s enter. Unverified visually.
9. **Duplicate `@keyframes admin-page-in`** is defined at top level and again inside `@media (min-width: 640px)` (`globals.css:397-407`). It works in current browsers but is fragile.
10. **Advanced links are not permission-filtered** (§4.3) and the list is hand-maintained; a new deep route will not appear there automatically.
11. **Two breakpoints.** Phone-first logic uses both `sm` and `md`. A 700px-wide window has the bottom bar and card tables but a 72px header and side-panel drawers.
12. **DataTable cards cannot sort** (§5.3).
13. **`PageHeader` icon-only rule depends on `:has(svg)`.** Browsers without `:has()` support keep text labels, which is a safe fallback.
14. **ConfirmModal and Drawer have no focus trap.** Escape and `aria-modal` are set; Tab can still leave the dialog. Pre-existing.
15. **Unrelated uncommitted change** to `app/admin/login/page.tsx` was in the working tree when this document was written. It is not part of this work.

---

## 9 · How-to guide

### 9.1 Make a new admin page phone-ready

1. Use `PageHeader` for the title and actions.
2. Wrap content in `px-4 sm:px-6`.
3. Render lists with `DataTable` (cards by default). For a raw `<table>`, add `admin-stack-table`.
4. Replace fixed widths with `w-full sm:w-[Npx]`; use `grid-cols-1 sm:grid-cols-2`.
5. Hold detail/edit views in `Drawer`.
6. For hand-built modals, add `admin-overlay` and `items-end sm:items-center`.
7. Add the page to `NAV_GROUPS` or `UNLISTED_RESOURCE_PATHS` in `lib/admin-nav.ts`, or the guard returns 403.
8. If the page is deep and rarely used, add it to `ADVANCED_LINKS` in `AdminSidebar.tsx`.

### 9.2 Add a filter sheet to a page

```tsx
import { MobileFilterSheet } from "@/components/admin/ui/MobileFilterSheet";

<div className="px-4 sm:px-6 flex flex-wrap items-center gap-3">
  <div className="relative max-sm:flex-1 sm:w-[280px]">{/* search */}</div>

  <MobileFilterSheet
    groups={[
      { type: "single", key: "status", label: "Status", value: status, onChange: setStatus,
        allLabel: "All statuses", options: STATUS_OPTIONS },
    ]}
  />

  <div className="contents max-sm:hidden">{/* existing desktop selects */}</div>
</div>
```

### 9.3 Make a header button icon-only on phones

```tsx
<button aria-label="Export" onClick={...}>
  <Download size={14} />
  <span className="max-sm:sr-only">Export</span>
</button>
```

Inside `PageHeader`'s `action`, any button or link that contains an `svg` collapses automatically.

### 9.4 Change the push animation

Edit `body[data-drawer-open] .admin-shell > main` in `app/globals.css:387-392` (distance and opacity) and `Drawer.tsx:53` (duration and easing). Keep them equal so the two screens move together.

### 9.5 Change the bottom tabs

Edit `BOTTOM_TABS` in `AdminSidebar.tsx:29`. Keep four items plus More; five labelled tabs at 360px leave about 72px each. Each `href` must exist in `NAV_GROUPS`, or the tab is filtered out.

### 9.6 Change the More > Advanced list

Edit `ADVANCED_LINKS` in `AdminSidebar.tsx:19`. Each `href` must be a real route.

---

## 10 · Verification log

### 10.1 Commands

| Date | Command | Result |
|---|---|---|
| 2026-10-16 | `git log b17190f^..HEAD`, `git show --stat b17190f 2c80e65` | Round 1 = 70 files, +541/-268. Round 2 = 13 files, +410/-47. |
| 2026-10-16 | `git status` | Only `app/admin/login/page.tsx` modified (unrelated). Round 2 is committed as `2c80e65`. |
| 2026-10-16 | `pnpm exec tsc --noEmit` (whole project) | See result line below. |
| Reported by change author | ESLint on changed files | Clean |
| Reported by change author | `pnpm vitest run` | 9 files / 57 tests fail; same as pre-existing baseline |

Result of the `tsc` run for this document: **exit 0, zero errors** (second run; a first run hit a 280s wrapper timeout and was discarded)

### 10.2 Facts checked against code

Class names, pixel values, prop names, hrefs and file:line references in this document were read from the source at HEAD. Where a claim depends on rendered behaviour, §8 marks it unverified.

### 10.3 Pending

| Item | Owner | Blocking? |
|---|---|---|
| Walk Orders, Products, Inventory, Customers, Tickets at 360, 390, 430px | Admin account holder | Yes, before release |
| Walk the same at 768px (rail, cards boundary at 767/768) | Admin account holder | Yes |
| Regression pass at 1280px (desktop unchanged) | Admin account holder | Yes |
| Real device: iOS Safari safe-area, `100dvh`, FAB, bulk bar overlap | Anyone with a phone | Yes |
| Decide on orphan pages and the two broken links | Product owner | No |
| Planned page work: Blog editor, RichTextEditor, ScheduleModal, Testimonials, Delivery zones, Settings Advanced-tab hiding | Backlog | No |
