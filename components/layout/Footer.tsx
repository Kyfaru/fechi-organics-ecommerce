"use client";

import Link from "next/link";
import Image from "next/image";
import { Icon } from "@iconify/react";
import { useState } from "react";
import { useCurrency } from "@/app/providers";
import type { CurrencyCode } from "@/lib/currency";

const COMPANY_LINKS = [
  { label: "Home", href: "/" },
  { label: "Contact", href: "/contact" },
  { label: "About Us", href: "/about" },
  { label: "FAQs", href: "/faq" },
  { label: "Blog", href: "/blog" },
];

const SHOP_LINKS = [
  { label: "All Products", href: "/shop" },
  { label: "Serum & Oils", href: "/shop?category=face-care" },
  { label: "Cleansers", href: "/shop?category=face-care" },
  { label: "Bundles", href: "/shop" },
];

const SUPPORT_LINKS = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Shipping", href: "/shipping" },
  { label: "Review", href: "/contact" },
];

const SOCIALS = [
  { icon: "mdi:facebook", href: "https://www.facebook.com/p/Fechi-organics-100063505811443/", label: "Facebook" },
  { icon: "mdi:instagram", href: "https://instagram.com", label: "Instagram" },
  { icon: "mdi:titok", href: "https://www.tiktok.com/@fechi.organics", label: "Tiktok" },
];

function InlineCurrencySwitcher() {
  const { currency, setCurrency, currencies } = useCurrency();
  const [open, setOpen] = useState(false);
  const current = currencies.find((c) => c.code === currency) ?? currencies[0];

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-[#c0cab8] overflow-hidden min-w-[150px] z-10">
          {currencies.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setCurrency(c.code as CurrencyCode);
                setOpen(false);
              }}
              className={[
                "w-full flex items-center gap-2 px-3 py-2 text-[13px] font-body text-left transition-colors",
                c.code === currency
                  ? "bg-[#27731e] text-white"
                  : "text-[#1a1c1c] hover:bg-[#e8fce3]",
              ].join(" ")}
            >
              <span className="font-semibold w-5 text-center">{c.symbol}</span>
              <span>{c.code}</span>
              <span className="text-[11px] opacity-60 ml-auto">{c.label}</span>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 bg-white/15 hover:bg-white/25 border border-white/30 rounded-lg px-2.5 py-1.5 text-[12px] font-body text-white/80 transition-colors"
        aria-label="Switch currency"
        aria-expanded={open}
      >
        <span className="font-semibold text-white">{current.symbol}</span>
        <span>{current.code}</span>
        <Icon
          icon={open ? "mdi:chevron-down" : "mdi:chevron-up"}
          width={13}
          className="text-white/60"
        />
      </button>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="relative bg-[#27731e] rounded-tl-[50px] rounded-tr-[50px] mt-16 overflow-hidden">
      {/* Large watermark logo */}
      <div className="absolute -left-16 -top-8 w-[500px] h-[400px] opacity-[0.09] pointer-events-none select-none">
        <Image
          src="logo/symbol-white.webp"
          alt=""
          fill
          className="object-contain object-left"
        />
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto px-8 pt-16 pb-6">
        {/* Main footer content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand column */}
          <div className="md:col-span-1">
            <Image
              src="logo/symbol-white.webp"
              alt="Fechi Organics"
              width={140}
              height={50}
              className="object-contain h-10 w-auto mb-5"
            />
            <p
              className="text-white text-[16px] leading-[1.7] tracking-[0.48px] max-w-[320px]"
              style={{ fontFamily: "var(--font-stagnan)" }}
            >
              Rooted in African botanical heritage, formulated with modern science to nourish,
              protect, and celebrate your natural skin.
            </p>
            {/* Socials */}
            <div className="flex items-center gap-4 mt-6">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="w-[27px] h-[27px] flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 transition-colors text-white"
                >
                  <Icon icon={s.icon} width={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Company links */}
          <FooterColumn title="Company" links={COMPANY_LINKS} />
          {/* Shop links */}
          <FooterColumn title="Shop" links={SHOP_LINKS} />
          {/* Support links */}
          <FooterColumn title="Support" links={SUPPORT_LINKS} />
        </div>

        {/* Divider + bottom bar */}
        <div className="border-t border-white/20 pt-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-white/70 text-[13px] tracking-[0.3px]">
            <p>© 2026 Fechi Organics. All rights reserved.</p>
            <p className="text-white/50 text-[12px] flex">Powered by <span className="flex gap-1"><Link href="https://kyfaru.com" target="_blank" rel="noopener noreferrer"><Image src="public/logo/Kyfaru-Logo-Filled-07.png" alt="Kyfaru" width={100} height={100} className="object-contain w-14 h-14" /> Kyfaru</Link></span></p>
            <div className="flex items-center gap-4">
              <p>
                <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
                {" · "}
                <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              </p>
              <InlineCurrencySwitcher />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h4
        className="text-[#ffc800] text-[18px] tracking-[0.88px] mb-4 font-semibold"
        style={{ fontFamily: "var(--font-stagnan)" }}
      >
        {title}
      </h4>
      <ul className="flex flex-col gap-3 list-none m-0 p-0">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-white text-[16px] tracking-[0.8px] hover:text-[#a4f690] transition-colors"
              style={{ fontFamily: "var(--font-stagnan)" }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
