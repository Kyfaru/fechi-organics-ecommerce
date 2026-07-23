import {
  LayoutDashboard, Package, ShoppingBag, Users, Warehouse, Truck,
  Mail, Tag, Heart, FileText, Layout, Star, HelpCircle, Image as ImageIcon,
  BarChart2, CreditCard, Shield, Settings, User, Bell, Building2,
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

/**
 * Resolves which resource (if any) a given admin pathname requires, by
 * matching against the same NAV_GROUPS data the sidebar uses. Returns
 * undefined for routes with no resource requirement (self-service pages,
 * or routes not represented in the nav at all) — the caller should treat
 * that as "always allowed", matching the sidebar's own default.
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
  return undefined;
}
