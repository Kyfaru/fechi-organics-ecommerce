// ============================================================================
// Real access control — Better Auth createAccessControl.
//
// `adminProfile.role` (a free-text string — "super_admin" | "admin" |
// "manager" | "finance" | "marketing" | "inventory" | "customer_care" |
// "viewer", or a comma-separated combination of these) is the source of
// truth passed explicitly into every permission check via
// `lib/require-permission.ts`. NOT `user.role` — that stays the Prisma
// `client|admin` enum and is unrelated to this fine-grained system.
//
// Resources intentionally NOT covered here (self-service / cross-cutting —
// every role keeps access regardless): profile, 2fa method, change-password,
// forgot/reset/verify-password, me, search, upload, activity. Those routes
// use `requireStaffSession()` instead (session + isActive/expiry only, no
// resource/action check).
// ============================================================================

import { createAccessControl } from "better-auth/plugins/access"
import { defaultStatements as adminDefaultStatements } from "better-auth/plugins/admin/access"

export const statements = {
  ...adminDefaultStatements, // user:[...], session:[...] — Better Auth's own built-ins (ban, impersonate, set-role, etc.)

  dashboard:         ["view"],
  products:          ["view", "create", "update", "delete"],
  inventory:         ["view", "update", "adjust"],
  orders:            ["view", "update_status", "cancel", "refund"],
  customers:         ["view", "update"],
  analytics:         ["view", "export"],
  finance:           ["view", "export"],
  campaigns:         ["view", "create", "update", "delete", "send"],
  promotions:        ["view", "create", "update", "delete"],
  loyalty:           ["view", "create", "update", "delete"],
  content:           ["view", "create", "update", "delete", "publish"],
  suppliers:         ["view", "create", "update", "delete"],
  delivery:          ["view", "create", "update", "delete"],
  branches:          ["view", "create", "update", "delete"],
  staff:             ["view", "invite", "update", "deactivate", "delete", "assign_roles"],
  settings:          ["view", "update"],
  notifications:     ["view", "manage"],
  tickets:           ["view", "update", "reply"],
  reviews:           ["view", "update", "delete"],
  contact_messages:  ["view", "update"],
  transactions:      ["view"],
} as const

export const ac = createAccessControl(statements)

// The 20 real app resources, derived at runtime from `statements` rather
// than hardcoded — keeps this list correct if a resource is ever added or
// removed. Excludes Better Auth's own built-in "user"/"session" statements
// (spread in from adminDefaultStatements), which aren't app resources.
export type AppResource = Exclude<keyof typeof statements, "user" | "session">

export const appResources = (Object.keys(statements) as (keyof typeof statements)[]).filter(
  (resource): resource is AppResource => resource !== "user" && resource !== "session"
)

// Every role below gets notifications:["view","manage"] — today every
// notification route is gated by requireAdminPage(req,"dashboard"), a
// workaround that's effectively open to any authenticated staff member.
// Granting it universally avoids a real regression (e.g. viewer losing the
// notification bell).
export const roles = {
  super_admin: ac.newRole({
    dashboard: ["view"], products: ["view", "create", "update", "delete"], inventory: ["view", "update", "adjust"],
    orders: ["view", "update_status", "cancel", "refund"], customers: ["view", "update"],
    analytics: ["view", "export"], finance: ["view", "export"], campaigns: ["view", "create", "update", "delete", "send"],
    promotions: ["view", "create", "update", "delete"], loyalty: ["view", "create", "update", "delete"],
    content: ["view", "create", "update", "delete", "publish"], suppliers: ["view", "create", "update", "delete"],
    delivery: ["view", "create", "update", "delete"], branches: ["view", "create", "update", "delete"],
    staff: ["view", "invite", "update", "deactivate", "delete", "assign_roles"], settings: ["view", "update"],
    notifications: ["view", "manage"], tickets: ["view", "update", "reply"], reviews: ["view", "update", "delete"],
    contact_messages: ["view", "update"], transactions: ["view"],
    user: adminDefaultStatements.user, session: adminDefaultStatements.session,
  }),

  // `isSuperAdmin` is false for role="admin" (only "super_admin" sets it true —
  // see staff/[id] PATCH), so "admin" gets no runtime bypass and must rely
  // entirely on this grant. Identical to super_admin's ac grant on purpose.
  admin: ac.newRole({
    dashboard: ["view"], products: ["view", "create", "update", "delete"], inventory: ["view", "update", "adjust"],
    orders: ["view", "update_status", "cancel", "refund"], customers: ["view", "update"],
    analytics: ["view", "export"], finance: ["view", "export"], campaigns: ["view", "create", "update", "delete", "send"],
    promotions: ["view", "create", "update", "delete"], loyalty: ["view", "create", "update", "delete"],
    content: ["view", "create", "update", "delete", "publish"], suppliers: ["view", "create", "update", "delete"],
    delivery: ["view", "create", "update", "delete"], branches: ["view", "create", "update", "delete"],
    staff: ["view", "invite", "update", "deactivate", "delete", "assign_roles"], settings: ["view", "update"],
    notifications: ["view", "manage"], tickets: ["view", "update", "reply"], reviews: ["view", "update", "delete"],
    contact_messages: ["view", "update"], transactions: ["view"],
    user: adminDefaultStatements.user, session: adminDefaultStatements.session,
  }),

  manager: ac.newRole({
    dashboard: ["view"], products: ["view", "create", "update", "delete"], inventory: ["view", "update", "adjust"],
    orders: ["view", "update_status", "cancel", "refund"], customers: ["view", "update"],
    analytics: ["view", "export"],
    finance: ["view"], // narrowed: AdminRolesClient.Manager.manage_finance === false
    campaigns: ["view", "create", "update", "delete", "send"], promotions: ["view", "create", "update", "delete"],
    loyalty: ["view", "create", "update", "delete"], content: ["view", "create", "update", "delete", "publish"],
    suppliers: ["view", "create", "update", "delete"], delivery: ["view", "create", "update", "delete"],
    branches: ["view"], notifications: ["view", "manage"], tickets: ["view", "update", "reply"],
    reviews: ["view", "update", "delete"], contact_messages: ["view", "update"], transactions: ["view"],
    // no staff, no settings — never in ROLE_TEMPLATES.manager
  }),

  finance: ac.newRole({
    dashboard: ["view"], finance: ["view", "export"], analytics: ["view", "export"],
    transactions: ["view"], branches: ["view"], notifications: ["view", "manage"],
    // everything else: none
  }),

  marketing: ac.newRole({
    dashboard: ["view"], loyalty: ["view", "create", "update", "delete"],
    campaigns: ["view", "create", "update", "delete", "send"], promotions: ["view", "create", "update", "delete"],
    content: ["view", "create", "update", "delete", "publish"], notifications: ["view", "manage"],
    // everything else: none
  }),

  inventory: ac.newRole({
    dashboard: ["view"], products: ["view", "create", "update", "delete"], inventory: ["view", "update", "adjust"],
    orders: ["view"], // narrowed: AdminRolesClient.Inventory.manage_orders === false
    suppliers: ["view", "create", "update", "delete"], delivery: ["view", "create", "update", "delete"],
    branches: ["view"], notifications: ["view", "manage"],
    // everything else: none
  }),

  customer_care: ac.newRole({
    dashboard: ["view"], customers: ["view", "update"], orders: ["view", "update_status", "cancel", "refund"],
    content: ["view"], // narrowed: AdminRolesClient.Support.manage_content === false
    tickets: ["view", "update", "reply"], reviews: ["view", "update"], // editorial: moderate, not delete
    contact_messages: ["view", "update"], branches: ["view"], notifications: ["view", "manage"],
    // everything else: none
  }),

  viewer: ac.newRole({
    dashboard: ["view"], notifications: ["view", "manage"],
    // no analytics — ROLE_TEMPLATES.viewer never granted it
  }),
} as const

export type RoleName = keyof typeof roles

// Better Auth types each role's `.statements` narrowly — only the resource
// keys that specific role was granted appear in its type (see
// node_modules/better-auth/dist/plugins/access/types.d.mts: ExactRoleStatements).
// Looking up an arbitrary resource across all 20 possibilities therefore
// needs one controlled cast here rather than an unsafe cast at every call
// site. Read-only lookup only, never mutates `roles`.
type GrantMap = Record<string, readonly string[] | undefined>

export function grantsFor(role: RoleName, resource: AppResource): readonly string[] {
  const grants = roles[role].statements as unknown as GrantMap
  return grants[resource] ?? []
}
