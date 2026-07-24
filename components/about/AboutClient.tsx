"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { Footer } from "@/components/layout/Footer";

/* ─── tiny helpers ───────────────────────────────────────────── */
function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 48 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ScaleIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.88 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Kenya SVG map ──────────────────────────────────────────────
   Pin coordinates are the real county centroids (not hand-plotted)
   lifted from the simplemaps.com Kenya county boundary file at
   `f:\Web Design\Fechi Organics\resources\ke.svg` (viewBox "0 0 1000 1000"),
   using each branch town's home county:
     Nairobi   -> Nairobi county        (KE47)
     Nakuru    -> Nakuru county         (KE32)
     Eldoret   -> Uasin Gishu county    (KE27) — Eldoret is Uasin Gishu's capital
     Mwea      -> Kirinyaga county      (KE20) — Mwea is a town in Kirinyaga
     Kitengela -> Kajiado county        (KE34) — Kitengela is a town in Kajiado
─────────────────────────────────────────────────────────────────*/
const SHOPS = [
  { name: "Nairobi",    place: "Spur Mall, 1st Floor, Shop F12",               x: 405,   y: 650.1, color: "#fec700" },
  { name: "Nakuru",     place: "Baraka Plaza, 1st Floor, Shop F2",              x: 330,   y: 564.6, color: "#a4f690" },
  { name: "Eldoret",    place: "Eldo Center, 1st Floor, Shop 6",               x: 266.7, y: 485.4, color: "#a4f690" },
  { name: "Mwea",       place: "MTC Building (Opp. Nice City), 1st Floor",     x: 445.4, y: 582.4, color: "#a4f690" },
  { name: "Kitengela",  place: "Next to Eastmart, 2nd Floor, Shop 63",         x: 396.8, y: 717.4, color: "#a4f690" },
];

function KenyaMap() {
  return (
    <div className="relative w-full max-w-[380px] aspect-square mx-auto drop-shadow-2xl">
      {/*
        Real Kenya county-boundary map (source: simplemaps.com, see comment above).
        Pre-colored light/dark variants are static assets under /public/img — plain
        <img> tags are used (not next/image) because Next's built-in image optimizer
        refuses local SVG sources unless `images.dangerouslyAllowSVG` is set in
        next.config.ts, which this ticket is explicitly not allowed to touch.
      */}
      <img
        src="/img/kenya-map-light.svg"
        alt="Map of Kenya showing FECHI Organics branch locations"
        className="absolute inset-0 w-full h-full object-contain dark:hidden"
      />
      <img
        src="/img/kenya-map-dark.svg"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-contain hidden dark:block"
      />

      {/* Pin overlay shares the map's 1000x1000 viewBox so markers align exactly */}
      <svg viewBox="0 0 1000 1000" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        {SHOPS.map((shop, i) => (
          <g key={shop.name}>
            <circle cx={shop.x} cy={shop.y} r="34" fill={shop.color} opacity="0.2">
              <animate attributeName="r"       values="24;44;24" dur="2.5s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0;0.3" dur="2.5s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
            </circle>
            <circle cx={shop.x} cy={shop.y} r="17" fill={shop.color} stroke="white" strokeWidth="4" />
            <text
              x={shop.x + (shop.x > 500 ? 24 : -24)}
              y={shop.y - 26}
              fontSize="24"
              fontWeight="700"
              textAnchor={shop.x > 500 ? "start" : "end"}
              fontFamily="sans-serif"
              className="fill-[#045a03] dark:fill-green-300"
            >
              {shop.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ─── Why Choose items ───────────────────────────────────────── */
const WHY_ITEMS = [
  { icon: "✦", title: "Proven Results",          desc: "Thousands of satisfied customers across Kenya trust FECHI for real, visible transformations.",                    size: "large",  bg: "#27731e", text: "white" },
  { icon: "◈", title: "High-Quality Ingredients", desc: "Every product is crafted with carefully selected, nature-inspired ingredients.",                                    size: "small",  bg: "#fec700", text: "#1a1c1c" },
  { icon: "◉", title: "Made for African Skin",    desc: "Formulated specifically for the unique needs of African skin and hair types.",                                      size: "small",  bg: "#e8fce3", text: "#1a1c1c" },
  { icon: "✿", title: "Professional Support",     desc: "Our expert team is always available to guide your skincare journey.",                                              size: "small",  bg: "#045a03", text: "white" },
  { icon: "❋", title: "Nationwide Branches",      desc: "5 branches across Kenya — Nairobi, Nakuru, Eldoret, Mwea & Kitengela.",                                          size: "small",  bg: "#a4f690", text: "#1a1c1c" },
  { icon: "✺", title: "Full Product Range",       desc: "Skincare, haircare, baby care, body care & signature fragrances — all in one brand.",                             size: "medium", bg: "#1a1c1c", text: "white" },
];

const CONCERNS = [
  { label: "Acne & Pimples",                  img: "/img/face care.jpg" },
  { label: "Hyperpigmentation & Dark Spots",  img: "/img/face care 2.jpg" },
  { label: "Uneven Skin Tone",                img: "/img/2149237797.jpg" },
  { label: "Fine Lines & Wrinkles",           img: "/img/292.jpg" },
  { label: "Eczema & Dry Skin",               img: "/img/2149618883.jpg" },
  { label: "Hair Thinning & Loss",            img: "/img/side-view-woman-with-afro-hairstyle.jpg" },
  { label: "Dark Under-Eyes",                 img: "/img/face care.jpg" },
  { label: "Body Discoloration",              img: "/img/face care 2.jpg" },
];

const TIMELINE = [
  { year: "The Beginning", label: "Founded in Kenya",       desc: "FECHI Organics was born from a passion for natural beauty and a need for effective, Africa-focused skincare." },
  { year: "Growth",        label: "First Branch Opens",     desc: "The first physical store opened its doors in Nairobi, welcoming thousands of loyal customers." },
  { year: "Expansion",     label: "Nationwide Reach",       desc: "FECHI expanded across Kenya — Nakuru, Eldoret, Mwea and Kitengela joined the growing family." },
  { year: "Today",         label: "Thousands Transformed",  desc: "A trusted household brand helping people achieve radiant skin and hair through the power of nature." },
];

/* Shape returned by GET /api/branches (no ?county param -> all active branches) */
type BranchInfo = {
  id: string;
  name: string;
  county: string;
  mpesaType: string;
  shortcode: string;
  phone: string | null;
};

/**
 * Looks up the branch phone number for a shop card by matching the SHOPS
 * town name against the branch's `name` field (seeded as "<Town> Branch",
 * e.g. "Eldoret Branch") since county names don't always match the town
 * (Eldoret -> Uasin Gishu, Mwea -> Kirinyaga, Kitengela -> Kajiado).
 */
function findBranchPhone(branches: BranchInfo[], shopName: string): string | null {
  const match = branches.find((b) => b.name.toLowerCase().startsWith(shopName.toLowerCase()));
  return match?.phone ?? null;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export function AboutClient() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY       = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  // Branch phone numbers for the shop cards below (fetched client-side; page
  // renders fine without them while loading or if the request fails).
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branches");
        const json = await res.json();
        if (!cancelled && json.ok) setBranches(json.data.branches ?? []);
      } catch (e) {
        console.error("[AboutClient] failed to load branches", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const { gsap }          = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      if (!timelineRef.current) return;
      const line = timelineRef.current.querySelector<SVGLineElement>(".timeline-line");
      if (line) {
        const totalLen = 600;
        gsap.set(line, { strokeDasharray: totalLen, strokeDashoffset: totalLen });
        const tween = gsap.to(line, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: timelineRef.current,
            start: "top 80%",
            end: "bottom 40%",
            scrub: true,
          },
        });
        cleanup = () => tween.scrollTrigger?.kill();
      }
    })();
    return () => cleanup?.();
  }, []);

  return (
    <div className="overflow-x-hidden">

      {/* ════════════════════════════════════════════════════════
          1. HERO — green always (no dark mode change needed)
      ════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative min-h-screen bg-[#27731e] flex flex-col items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div animate={{ scale: [1, 1.08, 1], rotate: [0, 6, 0] }}     transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}          className="absolute -top-24 -left-24 w-[500px] h-[500px] rounded-full bg-[#1f5a17] opacity-40" />
          <motion.div animate={{ scale: [1, 1.12, 1], rotate: [0, -8, 0] }}    transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 3 }} className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#045a03] opacity-50" />
          <motion.div animate={{ y: [0, -20, 0], x: [0, 10, 0] }}              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute top-1/3 right-[10%] w-[200px] h-[200px] rounded-full bg-[#a4f690] opacity-10" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden" aria-hidden>
          <span className="font-stagnan text-[#5cbd4e] whitespace-nowrap leading-none" style={{ fontSize: "clamp(200px, 45vw, 420px)", opacity: 0.12, letterSpacing: "0.05em" }}>FECHI</span>
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 flex flex-col items-center text-center px-6 max-w-4xl">
          <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="mb-8">
            <Image src="/logo/logo-white-version.webp" alt="FECHI Organics" width={180} height={60} className="object-contain" priority />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#a4f690] animate-pulse" />
            <span className="font-body text-white/80 text-sm tracking-widest uppercase">Proudly Kenyan</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }} className="font-heading font-semibold text-white leading-[1.05] mb-8" style={{ fontSize: "clamp(48px, 8vw, 96px)", letterSpacing: "-0.02em" }}>
            About <span className="text-[#a4f690]">FECHI</span><br />Organics
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.55 }} className="font-body text-white/75 text-lg md:text-xl leading-relaxed max-w-2xl">
            A proudly Kenyan skincare and wellness brand dedicated to helping people achieve
            healthy, radiant skin and hair through carefully formulated products inspired by
            nature and backed by results.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.75 }} className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link href="/shop"  className="bg-[#fec700] text-[#1a1c1c] font-body font-semibold px-8 py-4 rounded-full hover:bg-white transition-colors text-base">Shop Our Products</Link>
            <a    href="#wangeci" className="border border-white/40 text-white font-body px-8 py-4 rounded-full hover:bg-white/10 transition-colors text-base">Our Story ↓</a>
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span className="font-body text-white/40 text-xs tracking-widest uppercase">Scroll</span>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-px h-10 bg-gradient-to-b from-white/40 to-transparent" />
        </motion.div>
      </section>

      {/* ════════════════════════════════════════════════════════
          2. MEET WANGECI
      ════════════════════════════════════════════════════════ */}
      <section id="wangeci" className="relative py-28 md:py-36 bg-[#fafaf7] dark:bg-gray-950 overflow-hidden transition-colors">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#e8fce3] dark:bg-green-900/20 -translate-y-1/2 translate-x-1/2 opacity-60 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid md:grid-cols-[1fr_420px_1fr] gap-12 md:gap-8 items-center">

            {/* Left text */}
            <FadeUp delay={0.1}>
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 bg-[#e8fce3] dark:bg-green-900/40 rounded-full px-4 py-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#27731e] dark:bg-green-400" />
                  <span className="font-body text-[#27731e] dark:text-green-400 text-xs font-semibold tracking-widest uppercase">The Founder</span>
                </div>
                <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white leading-[1.1]" style={{ fontSize: "clamp(32px, 4vw, 52px)" }}>
                  Beauty begins<br /><span className="text-[#27731e] dark:text-green-400">with confidence</span>
                </h2>
                <p className="font-body text-[#40493c] dark:text-gray-400 text-base leading-relaxed">
                  FECHI Organics is a premium Kenyan skincare and beauty brand dedicated to providing high-quality, nature-inspired products that promote healthy, radiant skin and hair. We believe in delivering results through carefully selected ingredients, exceptional customer care, and innovative beauty solutions. 
                </p>
                <p className="font-body text-[#40493c] dark:text-gray-400 text-base leading-relaxed">
                  At FECHI Organics, we don&apost just sell products—we provide confidence, self-care, and lasting beauty. We proudly serve customers across Kenya and beyond with trusted, effective skincare solutions.
                </p>
              </div>
            </FadeUp>

            {/* Center — Wangeci image */}
            <ScaleIn delay={0.25} className="relative mx-auto">
              <motion.div animate={{ rotate: 360  }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="absolute inset-[-18px] rounded-full border-2 border-dashed border-[#27731e]/25 dark:border-green-500/20 pointer-events-none" />
              <motion.div animate={{ rotate: -360 }} transition={{ duration: 45, repeat: Infinity, ease: "linear" }} className="absolute inset-[-36px] rounded-full border border-dashed border-[#a4f690]/40 dark:border-green-400/20 pointer-events-none" />

              <div className="relative w-[340px] h-[440px] rounded-[200px] overflow-hidden shadow-2xl">
                <Image src="/img/wangeci-1.jpeg" alt="Wangeci — Founder of FECHI Organics" fill className="object-cover" sizes="340px" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#27731e]/60 via-transparent to-transparent" />
                <div className="absolute bottom-6 left-0 right-0 text-center">
                  <p className="font-heading text-white font-semibold text-xl">Wangeci</p>
                  <p className="font-body text-white/75 text-sm mt-1">Founder & CEO</p>
                </div>
              </div>

              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute -bottom-6 -right-6 bg-[#fec700] rounded-2xl px-5 py-3 shadow-xl">
                <p className="font-heading font-semibold text-[#1a1c1c] text-sm">1000+</p>
                <p className="font-body text-[#1a1c1c]/70 text-xs">Clients Helped</p>
              </motion.div>

              <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} className="absolute -top-6 -left-6 bg-white dark:bg-gray-800 rounded-2xl px-5 py-3 shadow-xl border border-[#e8fce3] dark:border-gray-700">
                <p className="font-heading font-semibold text-[#27731e] dark:text-green-400 text-sm">5 Branches</p>
                <p className="font-body text-[#40493c] dark:text-gray-400 text-xs">Across Kenya</p>
              </motion.div>
            </ScaleIn>

            {/* Right text */}
            <FadeUp delay={0.35}>
              <div className="space-y-6">
                <blockquote className="relative pl-5 border-l-4 border-[#27731e] dark:border-green-500">
                  <p className="font-heading text-[#1a1c1c] dark:text-white text-xl leading-snug italic">
                    "We don't just sell products — we provide solutions that restore confidence
                    and transform lives."
                  </p>
                  <footer className="mt-3 font-body text-[#27731e] dark:text-green-400 text-sm font-semibold">— Wangeci, Founder</footer>
                </blockquote>
                <p className="font-body text-[#40493c] dark:text-gray-400 text-base leading-relaxed">
                  Every product in the FECHI range is carefully crafted to address real skin
                  and hair concerns — designed for African skin, rooted in nature, and backed
                  by the trust of our community.
                </p>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  {[
                    { num: "5+",    label: "Kenyan Cities"    },
                    { num: "100%",  label: "Natural Inspired" },
                    { num: "6+",    label: "Product Lines"    },
                    { num: "★ 5.0", label: "Customer Love"    },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-[#e8fce3] dark:border-gray-800 shadow-sm">
                      <p className="font-heading font-semibold text-[#27731e] dark:text-green-400 text-2xl">{stat.num}</p>
                      <p className="font-body text-[#40493c] dark:text-gray-400 text-xs mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          3. BRAND TIMELINE — dark section, adapts slightly
      ════════════════════════════════════════════════════════ */}
      <section ref={timelineRef} className="relative py-28 bg-[#1a1c1c] dark:bg-gray-900 overflow-hidden transition-colors">
        <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07] pointer-events-none" aria-hidden style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27731e] to-transparent" />

        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <FadeUp className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-[#27731e]/20 border border-[#27731e]/40 rounded-full px-5 py-2 mb-6">
              <span className="font-body text-[#a4f690] text-xs tracking-widest uppercase">Our Journey</span>
            </div>
            <h2 className="font-heading font-semibold text-white leading-tight" style={{ fontSize: "clamp(32px, 5vw, 60px)" }}>
              Built on Purpose,<br /><span className="text-[#a4f690]">Driven by Nature</span>
            </h2>
          </FadeUp>

          {/* Desktop */}
          <div className="hidden md:block relative">
            <svg className="absolute top-7 left-0 right-0 w-full h-4 overflow-visible pointer-events-none" aria-hidden>
              <line className="timeline-line" x1="8%" y1="8" x2="92%" y2="8" stroke="#27731e" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="grid grid-cols-4 gap-8">
              {TIMELINE.map((item, i) => (
                <FadeUp key={item.year} delay={i * 0.15}>
                  <div className="relative pt-4">
                    <div className="relative z-10 w-4 h-4 rounded-full bg-[#27731e] border-2 border-[#a4f690] mb-6" />
                    <div className="bg-white/5 dark:bg-white/[0.03] backdrop-blur-sm border border-white/10 dark:border-white/[0.06] rounded-2xl p-6 hover:bg-white/10 dark:hover:bg-white/[0.06] transition-colors group">
                      <span className="font-body text-[#a4f690] text-xs font-semibold tracking-widest uppercase mb-3 block">{item.year}</span>
                      <h3 className="font-heading text-white font-semibold text-lg mb-2 group-hover:text-[#a4f690] transition-colors">{item.label}</h3>
                      <p className="font-body text-white/55 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-0">
            {TIMELINE.map((item, i) => (
              <FadeUp key={item.year} delay={i * 0.12}>
                <div className="flex gap-5">
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-[#27731e] border-2 border-[#a4f690] flex-shrink-0 mt-1" />
                    {i < TIMELINE.length - 1 && <div className="w-0.5 flex-1 bg-[#27731e]/40 my-2" />}
                  </div>
                  <div className="pb-8">
                    <span className="font-body text-[#a4f690] text-xs font-semibold tracking-widest uppercase">{item.year}</span>
                    <h3 className="font-heading text-white font-semibold text-lg mt-1 mb-2">{item.label}</h3>
                    <p className="font-body text-white/55 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          4. WHY CHOOSE FECHI
      ════════════════════════════════════════════════════════ */}
      <section className="relative py-28 bg-white dark:bg-gray-950 overflow-hidden transition-colors">
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-[#e8fce3] dark:bg-green-900/15 translate-x-1/3 translate-y-1/3 pointer-events-none opacity-70" />

        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <FadeUp className="mb-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 bg-[#e8fce3] dark:bg-green-900/40 rounded-full px-4 py-2 mb-5">
                  <span className="font-body text-[#27731e] dark:text-green-400 text-xs font-semibold tracking-widest uppercase">Why FECHI</span>
                </div>
                <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white leading-tight" style={{ fontSize: "clamp(32px, 5vw, 60px)" }}>
                  The FECHI<br /><span className="text-[#27731e] dark:text-green-400">Difference</span>
                </h2>
              </div>
              <p className="font-body text-[#40493c] dark:text-gray-400 text-base leading-relaxed max-w-sm">
                Six reasons why thousands of Kenyans choose FECHI Organics for their
                skincare and wellness journey.
              </p>
            </div>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WHY_ITEMS.map((item, i) => {
              const accentColor =
                item.bg === "#27731e" ? "#a4f690"
                : item.bg === "#045a03" ? "#a4f690"
                : item.bg === "#1a1c1c" ? "#fec700"
                : "#27731e";

              /* Light cards (#e8fce3, #a4f690, #fec700) need dark-mode overrides */
              const isLightCard  = ["#e8fce3", "#a4f690", "#fec700"].includes(item.bg);

              return (
                <ScaleIn
                  key={item.title}
                  delay={i * 0.08}
                  className={item.size === "large" ? "sm:col-span-2 lg:col-span-1 lg:row-span-2" : ""}
                >
                  <motion.div
                    whileHover={{ y: -4, scale: 1.01 }}
                    transition={{ duration: 0.25 }}
                    className={[
                      "h-full rounded-3xl p-8 flex flex-col justify-between min-h-[200px] cursor-default transition-colors",
                      /* For light-background brand cards, add a dark-mode override */
                      isLightCard ? "dark:bg-gray-800 dark:text-white" : "",
                    ].join(" ")}
                    style={{ backgroundColor: item.bg, color: item.text }}
                  >
                    <div>
                      <span className="text-4xl mb-5 block" style={{ color: accentColor }}>{item.icon}</span>
                      <h3 className="font-heading font-semibold text-xl md:text-2xl mb-3">{item.title}</h3>
                      <p className="font-body text-sm leading-relaxed" style={{ color: item.text === "white" ? "rgba(255,255,255,0.7)" : "rgba(26,28,28,0.65)" }}>
                        {item.desc}
                      </p>
                    </div>
                    {item.size === "large" && (
                      <div className="mt-8 inline-flex items-center gap-2 text-[#a4f690] font-body text-sm font-semibold">Learn More →</div>
                    )}
                  </motion.div>
                </ScaleIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          5. SKIN & HAIR CONCERNS
      ════════════════════════════════════════════════════════ */}
      <section className="relative py-28 bg-[#f5f8f3] dark:bg-gray-950 overflow-hidden transition-colors">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c0cab8] dark:via-gray-700 to-transparent" />

        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <FadeUp className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#27731e]/10 dark:bg-green-900/40 rounded-full px-4 py-2 mb-5">
              <span className="font-body text-[#27731e] dark:text-green-400 text-xs font-semibold tracking-widest uppercase">We Solve This</span>
            </div>
            <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white leading-tight mb-4" style={{ fontSize: "clamp(32px, 5vw, 60px)" }}>
              Concerns We <span className="text-[#27731e] dark:text-green-400">Address</span>
            </h2>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-base max-w-xl mx-auto leading-relaxed">
              Over the years, FECHI Organics has helped thousands of clients address these
              common skin and hair concerns — naturally and effectively.
            </p>
          </FadeUp>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CONCERNS.map((concern, i) => (
              <FadeUp key={concern.label} delay={i * 0.07}>
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  transition={{ duration: 0.3 }}
                  className={`relative overflow-hidden rounded-3xl group cursor-default ${i === 0 || i === 5 ? "md:col-span-2 h-72" : "h-56"}`}
                >
                  <Image src={concern.img} alt={concern.label} fill className="object-cover transition-transform duration-700 group-hover:scale-110" sizes="(max-width: 768px) 50vw, 25vw" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0d2309]/85 via-[#0d2309]/30 to-transparent" />
                  <div className="absolute inset-0 bg-[#27731e]/0 group-hover:bg-[#27731e]/40 transition-colors duration-300" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-[#a4f690] flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#1a1c1c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span className="font-body text-white font-semibold text-sm leading-tight">{concern.label}</span>
                    </div>
                    <div className="h-0.5 w-0 bg-[#a4f690] group-hover:w-full transition-all duration-500 rounded-full" />
                  </div>
                </motion.div>
              </FadeUp>
            ))}
          </div>

          <FadeUp className="mt-10 text-center" delay={0.3}>
            <Link href="/shop" className="inline-flex items-center gap-2 bg-[#27731e] text-white font-body font-semibold px-8 py-4 rounded-full hover:bg-[#045a03] transition-colors">
              Find Your Solution →
            </Link>
          </FadeUp>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          6. MISSION & VISION — green bg, no dark mode change
      ════════════════════════════════════════════════════════ */}
      <section className="relative py-28 overflow-hidden bg-[#27731e]">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-[#1f5a17] opacity-50 translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-[#045a03] opacity-60 -translate-x-1/3 translate-y-1/3 pointer-events-none" />
        <div className="absolute top-10 left-10 font-heading text-[#a4f690]/10 leading-none pointer-events-none select-none" style={{ fontSize: "20rem" }}>"</div>

        <div className="max-w-6xl mx-auto px-6 md:px-12 relative z-10">
          <FadeUp className="text-center mb-20">
            <span className="font-body text-[#a4f690] text-xs font-semibold tracking-widest uppercase">Our Purpose</span>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-8 md:gap-16">
            {/* Vision */}
            <ScaleIn delay={0.1}>
              <div className="relative bg-white/8 backdrop-blur-sm border border-white/15 rounded-3xl p-10 h-full">
                <div className="w-14 h-14 rounded-2xl bg-[#a4f690]/20 border border-[#a4f690]/30 flex items-center justify-center mb-8">
                  <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
                    <ellipse cx="14" cy="14" rx="10" ry="6.5" stroke="#a4f690" strokeWidth="2" />
                    <circle cx="14" cy="14" r="3.5" fill="#a4f690" />
                  </svg>
                </div>
                <div className="inline-flex items-center gap-2 bg-[#a4f690]/15 rounded-full px-4 py-1.5 mb-5">
                  <span className="font-body text-[#a4f690] text-xs font-semibold tracking-widest uppercase">Our Vision</span>
                </div>
                <blockquote className="font-heading text-white text-2xl md:text-3xl font-semibold leading-snug mb-6">
                  "To become a leading African beauty and wellness brand recognized for
                  transforming lives."
                </blockquote>
                <p className="font-body text-white/60 text-sm leading-relaxed">
                  We envision a world where every African woman and man has access to effective,
                  natural-inspired products that celebrate their unique beauty.
                </p>
                <div className="mt-8 h-0.5 w-16 bg-[#a4f690] rounded-full" />
              </div>
            </ScaleIn>

            {/* Mission */}
            <ScaleIn delay={0.25}>
              <div className="relative bg-[#fec700] rounded-3xl p-10 h-full">
                <div className="w-14 h-14 rounded-2xl bg-[#1a1c1c]/10 flex items-center justify-center mb-8">
                  <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
                    <circle cx="14" cy="14" r="10" stroke="#1a1c1c" strokeWidth="2" />
                    <circle cx="14" cy="14" r="6"  stroke="#1a1c1c" strokeWidth="2" />
                    <circle cx="14" cy="14" r="2.5" fill="#1a1c1c" />
                  </svg>
                </div>
                <div className="inline-flex items-center gap-2 bg-[#1a1c1c]/10 rounded-full px-4 py-1.5 mb-5">
                  <span className="font-body text-[#1a1c1c] text-xs font-semibold tracking-widest uppercase">Our Mission</span>
                </div>
                <blockquote className="font-heading text-[#1a1c1c] text-2xl md:text-3xl font-semibold leading-snug mb-6">
                  "To provide quality beauty and wellness products that inspire confidence,
                  self-care, and healthy living."
                </blockquote>
                <p className="font-body text-[#1a1c1c]/65 text-sm leading-relaxed">
                  Delivering exceptional customer experiences while making natural beauty
                  accessible to every Kenyan household.
                </p>
                <div className="mt-8 h-0.5 w-16 bg-[#1a1c1c]/30 rounded-full" />
              </div>
            </ScaleIn>
          </div>

          <FadeUp delay={0.4} className="mt-20 text-center">
            <p className="font-heading text-white/30 text-sm tracking-widest uppercase mb-4">Our Promise</p>
            <p className="font-heading text-white font-semibold text-center leading-tight" style={{ fontSize: "clamp(28px, 4vw, 52px)" }}>
              We don't just sell products,<br /><span className="text-[#a4f690]">we provide solutions.</span>
            </p>
          </FadeUp>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          7. LOCATIONS
      ════════════════════════════════════════════════════════ */}
      <section className="relative py-28 bg-[#fafaf7] dark:bg-gray-950 overflow-hidden transition-colors">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c0cab8] dark:via-gray-700 to-transparent" />

        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <FadeUp className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#e8fce3] dark:bg-green-900/40 rounded-full px-4 py-2 mb-5">
              <span className="font-body text-[#27731e] dark:text-green-400 text-xs font-semibold tracking-widest uppercase">Find Us</span>
            </div>
            <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white leading-tight mb-4" style={{ fontSize: "clamp(32px, 5vw, 60px)" }}>
              Visit Us Across <span className="text-[#27731e] dark:text-green-400">Kenya</span>
            </h2>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-base max-w-md mx-auto">
              5 branches nationwide — bringing natural beauty solutions closer to you.
            </p>
          </FadeUp>

          <div className="grid lg:grid-cols-[1fr_420px] gap-12 items-start">
            {/* Store cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              {SHOPS.map((shop, i) => (
                <FadeUp key={shop.name} delay={i * 0.1}>
                  <motion.div
                    whileHover={{ y: -3 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-[#e8fce3] dark:border-gray-800 shadow-sm hover:shadow-md hover:border-[#27731e]/30 dark:hover:border-green-700/50 transition-all group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#e8fce3] dark:bg-green-900/40 flex items-center justify-center flex-shrink-0 group-hover:bg-[#27731e] dark:group-hover:bg-green-700 transition-colors">
                        <svg className="w-5 h-5 text-[#27731e] dark:text-green-400 group-hover:text-white transition-colors" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-lg group-hover:text-[#27731e] dark:group-hover:text-green-400 transition-colors">{shop.name}</h3>
                        <p className="font-body text-[#40493c] dark:text-gray-400 text-sm mt-1 leading-relaxed">{shop.place}</p>
                        {findBranchPhone(branches, shop.name) && (
                          <p className="font-body text-[#27731e] dark:text-green-400 text-sm mt-2 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-.826 1.68l-1.293.646a11.037 11.037 0 006.105 6.105l.646-1.293a1.5 1.5 0 011.68-.826l3.223.716A1.5 1.5 0 0117 14.352V15.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 013.43 8.326 13.019 13.019 0 013 5V3.5z" />
                            </svg>
                            {findBranchPhone(branches, shop.name)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 h-0.5 w-0 bg-[#27731e] dark:bg-green-500 group-hover:w-full transition-all duration-500 rounded-full" />
                  </motion.div>
                </FadeUp>
              ))}

              {/* Online CTA card */}
              <FadeUp delay={0.5}>
                <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.25 }} className="bg-[#27731e] rounded-2xl p-6 sm:col-span-2">
                  <p className="font-body text-[#a4f690] text-xs font-semibold tracking-widest uppercase mb-3">Can't visit? No problem.</p>
                  <h3 className="font-heading text-white font-semibold text-xl mb-2">Order Online</h3>
                  <p className="font-body text-white/65 text-sm mb-5">Shop our full range from the comfort of your home. Delivery across Kenya.</p>
                  <Link href="/shop" className="inline-flex items-center gap-2 bg-[#fec700] text-[#1a1c1c] font-body font-semibold px-6 py-3 rounded-full hover:bg-white transition-colors text-sm">Shop Now →</Link>
                </motion.div>
              </FadeUp>
            </div>

            {/* Kenya map */}
            <ScaleIn delay={0.2} className="lg:sticky lg:top-28">
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-[#e8fce3] dark:border-gray-800 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-lg">Our Locations</h3>
                    <p className="font-body text-[#40493c] dark:text-gray-400 text-sm mt-0.5">5 branches across Kenya</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#fec700] border-2 border-white dark:border-gray-900 shadow" />
                    <span className="font-body text-[#40493c] dark:text-gray-400 text-xs">Flagship</span>
                    <div className="w-3 h-3 rounded-full bg-[#a4f690] border-2 border-white dark:border-gray-900 shadow ml-2" />
                    <span className="font-body text-[#40493c] dark:text-gray-400 text-xs">Branch</span>
                  </div>
                </div>
                <KenyaMap />
                <p className="font-body text-[#40493c]/50 dark:text-gray-600 text-xs text-center mt-4">Animated pins show exact branch locations</p>
              </div>
            </ScaleIn>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          8. FINAL CTA — dark section, stays the same
      ════════════════════════════════════════════════════════ */}
      <section className="h-fit bg-[#1a1c1c] dark:bg-gray-900 overflow-hidden transition-colors">
        <div className="relative py-28 ">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-[#27731e] opacity-15 blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <FadeUp>
            <Image src="/logo/logo-white-version.webp" alt="FECHI Organics" width={140} height={48} className="object-contain mx-auto mb-10 opacity-90" />
            <h2 className="font-heading font-semibold text-white leading-tight mb-6" style={{ fontSize: "clamp(32px, 5vw, 64px)" }}>
              Beautiful Skin. Healthy Hair.<br /><span className="text-[#a4f690]">Confidence Restored.</span>
            </h2>
            <p className="font-body text-white/55 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
              FECHI Organics — We don't just sell products, we provide solutions. ✨
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/shop"    className="bg-[#fec700] text-[#1a1c1c] font-body font-semibold px-10 py-4 rounded-full hover:bg-white transition-colors text-base">Shop Now</Link>
              <Link href="/contact" className="border border-white/30 text-white font-body px-10 py-4 rounded-full hover:bg-white/10 transition-colors text-base">Contact Us</Link>
            </div>
          </FadeUp>
        </div>
        </div>
        <Footer />
      </section>

    </div>
  );
}
