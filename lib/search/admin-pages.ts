/**
 * Hand-maintained index of admin sections/settings so global admin search
 * can jump straight to a page even when the match isn't a DB record.
 */
export const ADMIN_PAGES: Array<{ title: string; url: string; keywords: string[] }> = [
  { title: "Dashboard", url: "/admin", keywords: ["dashboard", "overview", "home"] },
  { title: "Products", url: "/admin/products", keywords: ["products", "catalog", "inventory item"] },
  { title: "Categories", url: "/admin/products/categories", keywords: ["categories", "product category"] },
  { title: "Product Reviews", url: "/admin/products/reviews", keywords: ["reviews", "product reviews", "ratings"] },
  { title: "Orders", url: "/admin/orders", keywords: ["orders", "order number", "order history"] },
  { title: "New Order", url: "/admin/orders/new", keywords: ["new order", "in-store order", "walk-in"] },
  { title: "Shipping & Tracking", url: "/admin/orders/tracking", keywords: ["shipping", "tracking", "delivery status"] },
  { title: "Customers", url: "/admin/customers", keywords: ["customers", "users", "buyers"] },
  { title: "Support Tickets", url: "/admin/customers/tickets", keywords: ["tickets", "support", "help desk"] },
  { title: "Loyalty Program", url: "/admin/loyalty", keywords: ["loyalty", "points", "tiers", "rewards"] },
  { title: "Staff", url: "/admin/staff", keywords: ["staff", "admins", "team"] },
  { title: "Roles", url: "/admin/staff/roles", keywords: ["roles", "permissions"] },
  { title: "Inventory", url: "/admin/inventory", keywords: ["inventory", "stock", "warehouse"] },
  { title: "Suppliers", url: "/admin/suppliers", keywords: ["suppliers", "vendors"] },
  { title: "Marketing", url: "/admin/marketing", keywords: ["marketing", "campaigns"] },
  { title: "Promotions", url: "/admin/promotions", keywords: ["promotions", "coupons", "discount codes", "promo code"] },
  { title: "Content — Blog", url: "/admin/content/blog", keywords: ["blog", "articles", "posts"] },
  { title: "Content — Homepage", url: "/admin/content/homepage", keywords: ["homepage", "banners", "hero"] },
  { title: "Content — Testimonials", url: "/admin/content/testimonials", keywords: ["testimonials", "reviews"] },
  { title: "Content — FAQs", url: "/admin/content/faqs", keywords: ["faq", "frequently asked questions"] },
  { title: "Transactions / Finance", url: "/admin/finance", keywords: ["finance", "transactions", "payments", "revenue"] },
  { title: "Contacts", url: "/admin/contacts", keywords: ["contacts", "contact form", "messages"] },
  { title: "Analytics", url: "/admin/analytics", keywords: ["analytics", "reports", "stats"] },
  { title: "Notifications", url: "/admin/notifications", keywords: ["notifications", "alerts"] },
  { title: "Security", url: "/admin/security", keywords: ["security", "audit log", "2fa"] },
  { title: "Settings — Delivery Zones", url: "/admin/settings/delivery-zones", keywords: ["delivery zones", "branches", "county"] },
  { title: "Settings", url: "/admin/settings", keywords: ["settings", "configuration"] },
  { title: "Profile", url: "/admin/profile", keywords: ["profile", "my account", "password"] },
];

export function searchAdminPages(query: string): Array<{ title: string; description: string; url: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ADMIN_PAGES.filter((p) => p.title.toLowerCase().includes(q) || p.keywords.some((k) => k.includes(q))).map(
    (p) => ({
      title: p.title,
      description: p.keywords.find((k) => k.includes(q)) ?? p.title,
      url: p.url,
    }),
  );
}
