"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";

type Faq = { id: string; question: string; answer: string; group: string };

/* ─── Hand-drawn "help" illustration (brand colors, no external assets) ─── */
function FaqIllustration() {
  return (
    <svg viewBox="0 0 420 420" className="w-full max-w-[420px] mx-auto" aria-hidden>
      <circle cx="210" cy="210" r="200" fill="#e8fce3" className="dark:fill-green-900/20" />
      <circle
        cx="210" cy="210" r="152" fill="none" stroke="#a4f690" strokeWidth="2"
        strokeDasharray="6 10" className="dark:stroke-green-700/60"
      />

      {/* speech bubble */}
      <g transform="translate(150 150)">
        <path
          d="M0 10c0-27.6 22.4-50 50-50h80c27.6 0 50 22.4 50 50v40c0 27.6-22.4 50-50 50H70l-34 30v-30H50c-27.6 0-50-22.4-50-50z"
          fill="#27731e" className="dark:fill-green-500"
        />
        <text x="95" y="72" fontSize="64" fontWeight="700" fill="#fec700" textAnchor="middle" fontFamily="sans-serif">?</text>
      </g>

      {/* magnifying glass */}
      <g transform="translate(272 268)">
        <circle cx="0" cy="0" r="30" fill="white" stroke="#27731e" strokeWidth="5" className="dark:fill-gray-800 dark:stroke-green-400" />
        <line x1="21" y1="21" x2="46" y2="46" stroke="#27731e" strokeWidth="7" strokeLinecap="round" className="dark:stroke-green-400" />
      </g>

      {/* small floating dots */}
      <circle cx="108" cy="300" r="7" fill="#fec700" />
      <circle cx="330" cy="140" r="5" fill="#a4f690" />
    </svg>
  );
}

export function FaqPageClient({ faqs }: { faqs: Faq[] }) {
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? faqs.filter((f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q))
      : faqs;
    const byGroup: Record<string, Faq[]> = {};
    for (const f of filtered) {
      const g = f.group || "General";
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(f);
    }
    return Object.entries(byGroup);
  }, [faqs, search]);

  const hasResults = groups.some(([, items]) => items.length > 0);

  return (
    <>
      {/* ══════════════════════════════════════════════════════
          HERO — illustration left, text right
      ══════════════════════════════════════════════════════ */}
      <section className="px-4 md:px-8 pt-14 pb-10 md:pt-20 md:pb-14 bg-white dark:bg-gray-950 transition-colors overflow-hidden">
        <div className="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-10 md:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="order-2 md:order-1"
          >
            <FaqIllustration />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="order-1 md:order-2"
          >
            <p className="font-body text-[#27731e] dark:text-green-400 text-[12px] md:text-[13px] tracking-[1.5px] uppercase mb-3 font-semibold">
              Help Center
            </p>
            <h1 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[36px] md:text-[52px] tracking-[-1px] leading-tight mb-5">
              Do you have questions about Fechi Organics and our products?
            </h1>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-[15px] md:text-[16px] leading-relaxed max-w-md">
              We&apos;ve gathered answers to the questions we hear most, from ingredients and
              delivery to payments and returns. Search below or scroll through to find yours.
            </p>
          </motion.div>
        </div>

        {/* Pulsing scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="flex justify-center mt-10 md:mt-14"
        >
          <span className="flex items-center justify-center w-11 h-11 rounded-full border-2 border-[#27731e] text-[#27731e] dark:border-green-400 dark:text-green-400">
            <Icon icon="mdi:arrow-down" width={22} />
          </span>
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FAQ GRID — search + two columns
      ══════════════════════════════════════════════════════ */}
      <section id="faqs" className="px-4 md:px-8 py-14 md:py-16 bg-[#f9fafb] dark:bg-neutral-950 transition-colors">
        <div className="max-w-[1100px] mx-auto">
          <div className="relative mb-10 max-w-lg mx-auto">
            <Icon
              icon="mdi:magnify"
              width={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-11 pr-4 py-3.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[15px] text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] transition-colors"
            />
          </div>

          {!hasResults && (
            <div className="text-center py-16 text-neutral-400">
              <p className="text-lg">No questions match &quot;{search}&quot;.</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
            {groups.map(([group, items]) =>
              items.length === 0 ? null : (
                <div key={group} className="md:col-span-2 mt-8 first:mt-0">
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#15803D] mb-4 pl-1">
                    {group}
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {items.map((faq) => (
                      <details
                        key={faq.id}
                        className="group bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden self-start"
                      >
                        <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none select-none">
                          <span className="text-[15px] font-semibold text-neutral-900 dark:text-white pr-4">
                            {faq.question}
                          </span>
                          <svg
                            className="w-4 h-4 text-[#15803D] shrink-0 transition-transform duration-200 group-open:rotate-180"
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div className="px-6 pb-5 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                          <p className="text-neutral-600 dark:text-neutral-400 text-[15px] leading-relaxed whitespace-pre-line">
                            {faq.answer}
                          </p>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CLOSING CTA
      ══════════════════════════════════════════════════════ */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 bg-[#f9fafb] dark:bg-neutral-950 transition-colors">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="bg-[#27731e] rounded-[24px] p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
          >
            <div>
              <h3 className="font-heading font-semibold text-white text-2xl md:text-3xl mb-2">
                Still have a question?
              </h3>
              <p className="font-body text-[#a4f690] text-[15px] max-w-md">
                Didn&apos;t find your answer? Ask us and we&apos;ll respond within 24 hours.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                href="/shop"
                className="inline-flex items-center justify-center gap-2 bg-white text-[#27731e] font-body font-semibold px-7 py-3.5 rounded-full hover:bg-[#f0fdf4] transition-colors text-[15px]"
              >
                Shop Now
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 bg-[#fec700] text-[#1a1c1c] font-body font-semibold px-7 py-3.5 rounded-full hover:brightness-95 transition-all text-[15px]"
              >
                Ask a Question
                <Icon icon="mdi:arrow-right" width={18} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
