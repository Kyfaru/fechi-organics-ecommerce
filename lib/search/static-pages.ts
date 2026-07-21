/**
 * Hand-maintained index of static client pages (no DB backing) so global
 * search can surface them — About, Contact, Shipping, Privacy, Terms, FAQ
 * intro, etc. Add an entry here whenever a new static content page ships.
 */
export const STATIC_PAGES: Array<{ title: string; url: string; keywords: string[] }> = [
  {
    title: "About Us",
    url: "/about",
    keywords: ["about", "our story", "fechi organics", "mission", "who we are", "founded"],
  },
  {
    title: "Contact Us",
    url: "/contact",
    keywords: ["contact", "reach us", "phone", "email", "support", "get in touch"],
  },
  {
    title: "Shipping",
    url: "/shipping",
    keywords: ["shipping", "delivery", "delivery fee", "delivery zone", "how long", "pickup"],
  },
  {
    title: "Privacy Policy",
    url: "/privacy-policy",
    keywords: ["privacy", "data", "personal information", "cookies", "gdpr"],
  },
  {
    title: "Terms & Conditions",
    url: "/terms",
    keywords: [
      "terms", "conditions", "orders", "payment", "promo codes", "returns", "refunds",
      "product descriptions", "intellectual property", "user accounts", "liability", "governing law",
    ],
  },
  {
    title: "FAQ",
    url: "/faq",
    keywords: ["faq", "frequently asked questions", "help"],
  },
  {
    title: "Wishlist",
    url: "/wishlist",
    keywords: ["wishlist", "saved items", "favorites"],
  },
  {
    title: "Track Your Order",
    url: "/orders",
    keywords: ["order", "track order", "order status", "order history"],
  },
];

export function searchStaticPages(query: string): Array<{ title: string; description: string; url: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return STATIC_PAGES.filter((p) => p.title.toLowerCase().includes(q) || p.keywords.some((k) => k.includes(q))).map(
    (p) => ({
      title: p.title,
      description: p.keywords.find((k) => k.includes(q)) ?? p.title,
      url: p.url,
    }),
  );
}
