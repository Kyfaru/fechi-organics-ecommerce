"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogOut, History, AlertTriangle, ChevronLeft, ChevronRight, Menu, X,
  LayoutDashboard, ShoppingCart, Package, Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { adminLogout } from "@/lib/admin-logout";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useAdminMe } from "@/hooks/use-can";
import { NAV_GROUPS, isActive, type NavItem } from "@/lib/admin-nav";
import type { PermissionCheck } from "@/lib/require-permission";

const ADVANCED_LINKS = [
  { href: "/admin/orders/shipping", label: "Shipping" },
  { href: "/admin/orders/tracking", label: "Order tracking" },
  { href: "/admin/products/categories", label: "Product categories" },
  { href: "/admin/products/qna", label: "Product Q&A" },
  { href: "/admin/products/zoho", label: "Zoho products" },
  { href: "/admin/settings/delivery-zones", label: "Delivery zones" },
  { href: "/admin/staff/roles", label: "Roles & permissions" },
];

const BOTTOM_TABS = [
  { href: "/admin", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, exact: false },
  { href: "/admin/products", label: "Products", icon: Package, exact: false },
  { href: "/admin/customers", label: "Customers", icon: Users, exact: false },
];

interface VisibleGroup {
  label: string;
  items: NavItem[];
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Tablet (md..lg) always shows the icon rail; full sidebar from lg.
  const [tablet, setTablet] = useState(false);
  const railed = collapsed || tablet;

  // Fetch current admin profile to drive permission-based nav filtering.
  // Cached for 5 minutes — sidebar doesn't need real-time permission updates.
  const { data: me } = useAdminMe();
  // /admin/activity and /admin/error-logs are both admin/super_admin-only
  // (see their pages + API routes) — hide the links entirely for roles that
  // would just hit a 403.
  const showActivityLink = Boolean(me?.isSuperAdmin || me?.role === "admin");

  // Precomputed once per `me` change (not per render/navigation) and passed
  // down as plain data — keeps SidebarContent a stable component so it never
  // remounts (and loses its scroll position) on route changes.
  const visibleGroups: VisibleGroup[] = useMemo(() => {
    function canSeeItem(item: NavItem): boolean {
      if (!item.resource) return true;
      if (!me?.role) return false;
      if (me.isSuperAdmin) return true;
      const deny: string[] = me.permissions?.deny ?? [];
      if (deny.includes(item.resource)) return false;
      const permissions = { [item.resource]: [item.action ?? "view"] } as PermissionCheck;
      return authClient.admin.checkRolePermission({ role: me.role, permissions });
    }
    return NAV_GROUPS.map((group) => ({ label: group.label, items: group.items.filter(canSeeItem) })).filter(
      (group) => group.items.length > 0
    );
  }, [me]);

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
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setTablet(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Header hamburger / bottom-bar "More" open the drawer via this event.
  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener("admin:open-nav", open);
    return () => window.removeEventListener("admin:open-nav", open);
  }, []);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const w = collapsed ? "72px" : "264px";
    document.documentElement.style.setProperty("--sidebar-w", w);
  }, [collapsed]);

  function handleLogout() {
    // Close explicitly so the modal can't resurface if this page is ever
    // restored from bfcache (see AdminSessionGuard).
    setLogoutConfirming(false);
    // Instant wipe + route; server invalidation runs in the background.
    adminLogout(router);
  }

  const [logoutConfirming, setLogoutConfirming] = useState(false);
  const allowedHrefs = useMemo(
    () => new Set(visibleGroups.flatMap((g) => g.items.map((i) => i.href))),
    [visibleGroups],
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={["hidden md:flex flex-col fixed left-0 top-0 h-full border-r border-(--green-800) dark:border-(--dark-border) z-30 transition-all duration-200 overflow-hidden", railed ? "w-[72px]" : "w-[264px]"].join(" ")}
      >
        <SidebarContent
          collapsed={railed}
          hideToggle={tablet}
          pathname={pathname}
          visibleGroups={visibleGroups}
          showActivityLink={showActivityLink}
          onToggleCollapsed={toggleCollapsed}
          onLogoutClick={() => setLogoutConfirming(true)}
        />
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 flex bg-white dark:bg-(--dark-surface) border-t border-(--neutral-200) dark:border-(--dark-border) pb-[env(safe-area-inset-bottom)]"
      >
        {BOTTOM_TABS.filter((t) => allowedHrefs.has(t.href)).map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex-1 flex flex-col items-center justify-center gap-0.5 h-14 font-dm text-[11px] font-medium active:scale-95 transition",
                active ? "text-(--green-800) dark:text-(--dark-accent)" : "text-(--neutral-500) dark:text-(--dark-muted)",
              ].join(" ")}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 h-14 font-dm text-[11px] font-medium text-(--neutral-500) dark:text-(--dark-muted) active:scale-95 transition"
        >
          <Menu size={20} />
          More
        </button>
      </nav>

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
              role="dialog" aria-modal="true" aria-label="Navigation"
              className="md:hidden fixed left-0 top-0 h-dvh w-[min(300px,85vw)] z-50"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-[6px] text-(--neutral-500) hover:bg-(--neutral-100)"
              >
                <X size={18} />
              </button>
              <SidebarContent
                mobile
                collapsed={false}
                pathname={pathname}
                visibleGroups={visibleGroups}
                showActivityLink={showActivityLink}
                onNavClick={() => setMobileOpen(false)}
                onToggleCollapsed={toggleCollapsed}
                onLogoutClick={() => setLogoutConfirming(true)}
              />
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

// Hoisted to module scope — defining this inside AdminSidebar's render body
// gave it a new function identity on every render (every pathname change),
// which made React treat it as a different component type and remount the
// whole nav tree, resetting the scrollable nav's scroll position on every
// navigation. Kept as a stable top-level component instead.
interface SidebarContentProps {
  mobile?: boolean;
  hideToggle?: boolean;
  collapsed: boolean;
  pathname: string;
  visibleGroups: VisibleGroup[];
  showActivityLink: boolean;
  onNavClick?: () => void;
  onToggleCollapsed: () => void;
  onLogoutClick: () => void;
}

function SidebarContent({
  mobile = false, hideToggle = false, collapsed, pathname, visibleGroups, showActivityLink, onNavClick, onToggleCollapsed, onLogoutClick,
}: SidebarContentProps) {
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
        {visibleGroups.map((group) => (
          <div key={group.label}>
            {(!collapsed || mobile) && (
              <div className="font-dm text-[11px] font-semibold uppercase tracking-wider text-(--green-200) dark:text-(--dark-muted) px-2 mb-2">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href, item.exact);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed && !mobile ? item.label : undefined}
                    onClick={() => mobile && onNavClick?.()}
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
        ))}

        {/* Phones only: deep / rarely-used pages that have no sidebar entry. */}
        {mobile && (
          <details className="group">
            <summary className="font-dm text-[11px] font-semibold uppercase tracking-wider text-(--green-200) dark:text-(--dark-muted) px-2 mb-2 cursor-pointer list-none flex items-center justify-between">
              Advanced
              <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
            </summary>
            <div className="space-y-0.5">
              {ADVANCED_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => onNavClick?.()}
                  className="flex items-center h-11 rounded-[8px] px-3 font-dm text-[14px] font-medium text-white/80 dark:text-(--dark-text) hover:bg-(--green-800) dark:hover:bg-(--dark-border)"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </details>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-(--green-800) dark:border-(--dark-border) p-3 space-y-0.5 shrink-0">
        {showActivityLink && (
          <Link
            href="/admin/activity"
            className={["flex items-center gap-3 h-10 rounded-[8px] px-3 text-white/70 dark:text-(--dark-muted) hover:bg-(--green-800) dark:hover:bg-(--dark-border) transition-colors", collapsed && !mobile ? "justify-center" : ""].join(" ")}
            title={collapsed && !mobile ? "Activity Log" : undefined}
          >
            <History size={18} />
            {(!collapsed || mobile) && <span className="font-dm text-[13px]">Activity Log</span>}
          </Link>
        )}
        {showActivityLink && (
          <Link
            href="/admin/error-logs"
            className={["flex items-center gap-3 h-10 rounded-[8px] px-3 text-white/70 dark:text-(--dark-muted) hover:bg-(--green-800) dark:hover:bg-(--dark-border) transition-colors", collapsed && !mobile ? "justify-center" : ""].join(" ")}
            title={collapsed && !mobile ? "Error Logs" : undefined}
          >
            <AlertTriangle size={18} />
            {(!collapsed || mobile) && <span className="font-dm text-[13px]">Error Logs</span>}
          </Link>
        )}
        <button
          onClick={onLogoutClick}
          className={["w-full flex items-center gap-3 h-10 rounded-[8px] px-3 text-[#ff4545] hover:text-[#ff0f0f] hover:bg-(--green-800) dark:hover:bg-(--dark-border) transition-colors", collapsed && !mobile ? "justify-center" : ""].join(" ")}
          title={collapsed && !mobile ? "Sign out" : undefined}
        >
          <LogOut size={18} />
          {(!collapsed || mobile) && <span className="font-dm text-[13px]">Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle — desktop only */}
      {!mobile && !hideToggle && (
        <div className="border-t border-(--green-800) dark:border-(--dark-border) p-2 shrink-0">
          <button
            onClick={onToggleCollapsed}
            className="w-full flex items-center justify-center h-8 rounded-[6px] text-white/40 hover:bg-(--green-800) dark:hover:bg-(--dark-border) transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      )}
    </div>
  );
}
