"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Package, ShoppingBag, Users, Warehouse, Truck,
  Mail, Tag, Heart, FileText, Layout, Star, HelpCircle, Image as ImageIcon,
  BarChart2, CreditCard, Shield, Settings, LogOut, ArrowLeft,
  ChevronLeft, ChevronRight, Menu, X, User, Bell,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { signOut } from "@/lib/auth-client";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { canAccess, type AdminPage } from "@/lib/permissions";

// Each nav item optionally maps to an AdminPage key for permission filtering.
// Items without a page key (e.g. Dashboard) are always shown.
type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
  page?: AdminPage;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  { label: "STORE", items: [
    { href: "/admin",          icon: LayoutDashboard, label: "Dashboard", exact: true },
    { href: "/admin/products", icon: Package,         label: "Products",  page: "products" },
    { href: "/admin/orders",   icon: ShoppingBag,     label: "Orders",    page: "orders" },
    { href: "/admin/customers",icon: Users,           label: "Customers", page: "customers" },
  ]},
  { label: "OPERATIONS", items: [
    { href: "/admin/inventory", icon: Warehouse, label: "Inventory", page: "inventory" },
    { href: "/admin/suppliers", icon: Truck,     label: "Suppliers", page: "suppliers" },
  ]},
  { label: "MARKETING", items: [
    { href: "/admin/marketing",             icon: Mail,  label: "Campaigns",   page: "campaigns" },
    { href: "/admin/promotions",  icon: Tag,   label: "Promotions",  page: "promotions" },
    { href: "/admin/loyalty",               icon: Heart, label: "Loyalty",     page: "marketing" },
  ]},
  { label: "CONTENT", items: [
    { href: "/admin/content/blog",         icon: FileText,  label: "Blog",         page: "content" },
    { href: "/admin/content/homepage",     icon: Layout,    label: "Homepage",     page: "content" },
    { href: "/admin/content/testimonials", icon: Star,      label: "Testimonials", page: "content" },
    { href: "/admin/content/faqs",         icon: HelpCircle,label: "FAQs",         page: "content" },
    { href: "/admin/content/banners",      icon: ImageIcon, label: "Banners",      page: "content" },
  ]},
  { label: "ANALYTICS", items: [
    { href: "/admin/analytics", icon: BarChart2, label: "Reports", page: "analytics" },
    { href: "/admin/finance",   icon: CreditCard,label: "Finance", page: "finance" },
  ]},
  { label: "SETTINGS", items: [
    { href: "/admin/notifications", icon: Bell,    label: "Notifications" },
    { href: "/admin/staff",    icon: Shield,  label: "Staff & Roles", page: "staff" },
    { href: "/admin/profile",  icon: User,    label: "My Profile",    page: "profile" },
    { href: "/admin/security", icon: Shield,  label: "Security",      page: "settings" },
    { href: "/admin/settings", icon: Settings,label: "Settings",      page: "settings" },
  ]},
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fetch current admin profile to drive permission-based nav filtering.
  // Cached for 5 minutes — sidebar doesn't need real-time permission updates.
  const { data: me } = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => fetch("/api/admin/me").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Returns true if the current user can see this nav item.
  function canSeeItem(item: NavItem): boolean {
    // Items with no page key (e.g. Dashboard) are always shown.
    if (!item.page) return true;
    // Super-admins see everything.
    if (me?.isSuperAdmin) return true;
    const perms = (me?.permissions ?? {}) as Record<string, unknown>;
    return canAccess(perms, item.page);
  }

  useEffect(() => {
    const stored = localStorage.getItem("adminSidebarCollapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("adminSidebarCollapsed", String(next));
    document.documentElement.style.setProperty("--sidebar-w", next ? "72px" : "264px");
  }

  useEffect(() => {
    const w = collapsed ? "72px" : "264px";
    document.documentElement.style.setProperty("--sidebar-w", w);
  }, [collapsed]);

  async function handleLogout() {
    await signOut();
    router.push("/admin/login");
  }

  const [logoutConfirming, setLogoutConfirming] = useState(false);

  function SidebarContent({ mobile = false }: { mobile?: boolean }) {
    return (
      <div className="flex flex-col h-full bg-(--green-900) dark:bg-(--dark-surface)">
        {/* Logo zone */}
        <div className="h-[72px] flex items-center px-4 border-b border-(--green-800) dark:border-(--dark-border) shrink-0">
          {(!collapsed || mobile) ? (
            <div className="flex items-center gap-3">
              <Image src="/logo/symbol-white.webp" alt="Fechi Organics" width={32} height={32} className="rounded" />
              <div>
                <div className="font-syne text-[14px] font-semibold text-white dark:text-(--dark-text) leading-tight">Fechi Organics</div>
                <div className="font-dm text-[11px] text-white/60 dark:text-(--dark-muted)">Admin Panel</div>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <Image src="/logo/symbol-white.webp" alt="Fechi" width={32} height={32} className="rounded" />
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter(canSeeItem);
            // Hide the entire group when all items are filtered out
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label}>
                {(!collapsed || mobile) && (
                  <div className="font-dm text-[11px] font-semibold uppercase tracking-wider text-(--green-200) dark:text-(--dark-muted) px-2 mb-2">
                    {group.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = isActive(pathname, item.href, item.exact);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed && !mobile ? item.label : undefined}
                        onClick={() => mobile && setMobileOpen(false)}
                        className={[
                          "relative flex items-center gap-3 h-11 rounded-[8px] transition-colors overflow-hidden",
                          collapsed && !mobile ? "justify-center px-0" : "px-3",
                          active
                            ? "bg-white/15 text-white dark:bg-(--dark-accent)/15 dark:text-(--dark-accent)"
                            : "text-white/80 dark:text-(--dark-text) hover:bg-(--green-800) dark:hover:bg-(--dark-border)",
                        ].join(" ")}
                      >
                        {active && (
                          <span className="absolute left-0 top-[20%] h-[60%] w-[3px] bg-(--gold-500) dark:bg-(--dark-accent) rounded-r" />
                        )}
                        <Icon size={20} className="shrink-0" />
                        {(!collapsed || mobile) && (
                          <span className="font-dm text-[14px] font-medium">{item.label}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-(--green-800) dark:border-(--dark-border) p-3 space-y-0.5 shrink-0">
          <Link
            href="/"
            className={["flex items-center gap-3 h-10 rounded-[8px] px-3 text-white/70 dark:text-(--dark-muted) hover:bg-(--green-800) dark:hover:bg-(--dark-border) transition-colors", collapsed && !mobile ? "justify-center" : ""].join(" ")}
            title={collapsed && !mobile ? "Back to Store" : undefined}
          >
            <ArrowLeft size={18} />
            {(!collapsed || mobile) && <span className="font-dm text-[13px]">Back to Store</span>}
          </Link>
          <button
            onClick={() => setLogoutConfirming(true)}
            className={["w-full flex items-center gap-3 h-10 rounded-[8px] px-3 text-[#ff4545] hover:text-[#ff0f0f] hover:bg-(--green-800) dark:hover:bg-(--dark-border) transition-colors", collapsed && !mobile ? "justify-center" : ""].join(" ")}
            title={collapsed && !mobile ? "Sign out" : undefined}
          >
            <LogOut size={18} />
            {(!collapsed || mobile) && <span className="font-dm text-[13px]">Sign out</span>}
          </button>
        </div>

        {/* Collapse toggle — desktop only */}
        {!mobile && (
          <div className="border-t border-(--green-800) dark:border-(--dark-border) p-2 shrink-0">
            <button
              onClick={toggleCollapsed}
              className="w-full flex items-center justify-center h-8 rounded-[6px] text-white/40 hover:bg-(--green-800) dark:hover:bg-(--dark-border) transition-colors"
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={["hidden md:flex flex-col fixed left-0 top-0 h-full border-r border-(--green-800) dark:border-(--dark-border) z-30 transition-all duration-200 overflow-hidden", collapsed ? "w-[72px]" : "w-[264px]"].join(" ")}
      >
        <SidebarContent />
      </aside>

      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-white dark:bg-(--dark-surface) rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1)"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={20} className="text-(--neutral-700) dark:text-(--dark-text)" />
      </button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/45 z-40"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.2 }}
              className="md:hidden fixed left-0 top-0 h-full w-[280px] z-50"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-[6px] text-(--neutral-500) hover:bg-(--neutral-100)"
              >
                <X size={18} />
              </button>
              <SidebarContent mobile />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={logoutConfirming}
        onClose={() => setLogoutConfirming(false)}
        onConfirm={handleLogout}
        title="Sign out?"
        description="You will be returned to the login screen."
        confirmLabel="Sign out"
        danger={true}
      />
    </>
  );
}
