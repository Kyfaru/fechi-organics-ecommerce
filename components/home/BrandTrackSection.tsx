"use client";

import { motion } from "framer-motion";
import { Icon } from "@iconify/react";

// Country flags using @iconify/react circle-flags
const COUNTRIES = [
  { code: "ke", label: "Kenya" },
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "za", label: "South Africa" },
  { code: "ng", label: "Nigeria" },
  { code: "cn", label: "China" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "au", label: "Australia" },
  { code: "in", label: "India" },
  { code: "br", label: "Brazil" },
  { code: "ae", label: "UAE" },
];

// Duplicate 5 times for seamless loop
const TRACK_ITEMS = [...COUNTRIES, ...COUNTRIES, ...COUNTRIES, ...COUNTRIES, ...COUNTRIES];

export function BrandTrackSection() {
  return (
    <section className="py-16 bg-[#f4fff3] overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 mb-10">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center font-heading font-medium text-[#27731e] text-[40px] md:text-[58px] tracking-[1.16px] leading-[0.84]"
        >
          Trusted Globally
        </motion.h2>
      </div>

      {/* Infinite marquee */}
      <div className="relative overflow-hidden">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#f4fff3] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#f4fff3] to-transparent z-10 pointer-events-none" />

        <div
          className="fechi-marquee flex gap-8 items-center"
          style={{ width: "max-content" }}
        >
          {TRACK_ITEMS.map((country, idx) => (
            <div
              key={`${country.code}-${idx}`}
              className="flex-shrink-0 flex flex-col items-center gap-2"
              title={country.label}
            >
              <Icon
                icon={`circle-flags:${country.code}`}
                width={75}
                height={75}
                className="drop-shadow-md"
              />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fechi-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-100% / 5)); }
        }
        .fechi-marquee {
          animation: fechi-marquee 40s linear infinite;
        }
      `}</style>
    </section>
  );
}
