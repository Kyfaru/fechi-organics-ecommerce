import {
  LayoutDashboard, Package, ShoppingBag, Users, Warehouse, Truck,
  Mail, Tag, Heart, FileText, Layout, Star, HelpCircle, Image as ImageIcon,
  BarChart2, CreditCard, Shield, Settings, User, Bell, Building2, ClipboardCheck,
} from "lucide-react";
import type { statements, AppResource } from "@/lib/permissions";

// Single source of truth for the admin nav structure — used by both
// AdminSidebar.tsx (visibility filtering) and the in-place 403 guard in
// app/admin/(protected)/layout.tsx (resourceForPath), so a route's required
// resource is never defined in two places that could drift apart.
//
// Each nav item optionally maps to a `statements` resource key for
// permission-based filtering, defaulting to the "view" action. Items with no
// resource (e.g. Dashboard, My Profile, Security) are always shown/allowed.
export type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
  resource?: keyof typeof statements;
  action?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  { label: "STORE", items: [
    { href: "/admin",          icon: LayoutDashboard, label: "Dashboard", exact: true },
    { href: "/admin/products", icon: Package,         label: "Products",  resource: "products" },
    { href: "/admin/orders",   icon: ShoppingBag,     label: "Orders",    resource: "orders" },
    { href: "/admin/customers",icon: Users,           label: "Customers", resource: "customers" },
  ]},
  { label: "OPERATIONS", items: [
    { href: "/admin/inventory", icon: Warehouse, label: "Inventory", resource: "inventory" },
    { href: "/admin/suppliers", icon: Truck,     label: "Suppliers", resource: "suppliers" },
    { href: "/admin/branches",  icon: Building2, label: "Branches",  resource: "branches" },
  ]},
  { label: "MARKETING", items: [
    { href: "/admin/marketing",             icon: Mail,  label: "Campaigns",   resource: "campaigns" },
    { href: "/admin/promotions",  icon: Tag,   label: "Promotions",  resource: "promotions" },
    { href: "/admin/loyalty",               icon: Heart, label: "Loyalty",     resource: "loyalty" },
  ]},
  { label: "CONTENT", items: [
    { href: "/admin/content/blog",         icon: FileText,  label: "Blog",         resource: "content" },
    { href: "/admin/content/homepage",     icon: Layout,    label: "Homepage",     resource: "content" },
    { href: "/admin/content/testimonials", icon: Star,      label: "Testimonials", resource: "content" },
    { href: "/admin/content/faqs",         icon: HelpCircle,label: "FAQs",         resource: "content" },
    { href: "/admin/content/banners",      icon: ImageIcon, label: "Banners",      resource: "content" },
  ]},
  { label: "ANALYTICS", items: [
    { href: "/admin/analytics", icon: BarChart2, label: "Reports", resource: "analytics" },
    { href: "/admin/finance",   icon: CreditCard,label: "Finance", resource: "finance" },
  ]},
  { label: "SETTINGS", items: [
    { href: "/admin/notifications", icon: Bell,    label: "Notifications" },
    { href: "/admin/approvals", icon: ClipboardCheck, label: "Approvals", resource: "approvals" },
    { href: "/admin/staff",    icon: Shield,  label: "Staff & Roles", resource: "staff" },
    { href: "/admin/profile",  icon: User,    label: "My Profile" },
    { href: "/admin/security", icon: Shield,  label: "Security" },
    { href: "/admin/settings", icon: Settings,label: "Settings",      resource: "settings" },
  ]},
];

export function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

// Pages that need a resource check but aren't (yet) linked from the sidebar —
// kept separate from NAV_GROUPS so adding them here doesn't also add a
// visible nav link. resourceForPath still enforces them the same as any
// listed page; only AdminSidebar.tsx's rendering skips this list.
const UNLISTED_RESOURCE_PATHS: { href: string; resource: AppResource }[] = [
  { href: "/admin/transactions", resource: "transactions" },
  { href: "/admin/users", resource: "customers" },
  // Not in NAV_GROUPS since it's linked from the sidebar's bottom slot
  // (replacing "Back to Store"), not a group item. Also hard-restricted to
  // admin/super_admin in the page itself and in GET /api/admin/activity —
  // this staff:view check is just the outer resource gate.
  { href: "/admin/activity", resource: "staff" },
];

// The only admin paths allowed with NO resource check at all — self-service
// pages every authenticated staff member keeps regardless of role. Anything
// under /admin/* that isn't here and isn't covered by NAV_GROUPS or
// UNLISTED_RESOURCE_PATHS is denied by default (see AdminGuard) — a new page
// that forgets to register a resource fails closed instead of open.
export const NO_RESOURCE_REQUIRED_PATHS = [
  "/admin",
  "/admin/profile",
  "/admin/security",
  "/admin/notifications",
  // Legacy redirect stubs — zero data, they just forward to an already-gated
  // page (app/admin/(protected)/contacts/page.tsx and .../testimonials/page.tsx).
  "/admin/contacts",
  "/admin/testimonials",
];

export function isNoResourcePath(pathname: string): boolean {
  return NO_RESOURCE_REQUIRED_PATHS.some(
    (p) => pathname === p || (p !== "/admin" && pathname.startsWith(p + "/"))
  );
}

/**
 * Resolves which resource (if any) a given admin pathname requires, by
 * matching against NAV_GROUPS (the sidebar's own data) plus
 * UNLISTED_RESOURCE_PATHS (gated pages not linked from the sidebar).
 * Returns undefined only for genuinely no-resource-required pages — see
 * isNoResourcePath, which the caller (AdminGuard) uses to fail closed on
 * anything else.
 */
export function resourceForPath(pathname: string): AppResource | undefined {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!item.resource) continue;
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return item.resource as AppResource;
      }
    }
  }
  for (const item of UNLISTED_RESOURCE_PATHS) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      return item.resource;
    }
  }
  return undefined;
}
