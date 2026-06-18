"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";

const FAQS = [
  {
    q: "Can I order from abroad?",
    a: "Yes, we ship internationally to over 12 countries. Orders typically arrive within 7–14 business days depending on your location.",
  },
  {
    q: "Who can take Fechi Organics products?",
    a: "Our products are formulated for all skin types and ages. We have a dedicated baby & kids range for younger skin, and all our products are dermatologist-tested.",
  },
  {
    q: "What are the benefits of Fechi Organic products?",
    a: "Fechi Organics products are 100% natural, cruelty-free, and crafted from African botanical ingredients that have been used for generations to promote healthy, glowing skin.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  function toggle(i: number) {
    setOpenIndex((prev) => (prev === i ? null : i));
  }

  return (
    <section className="py-16 px-4 md:px-8 bg-white dark:bg-gray-950">
      <div className="max-w-[1440px] mx-auto">
        {/* Eyebrow row */}
        <div className="flex items-center gap-6 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#27731e] inline-block" />
            <span className="font-body text-[14px] text-[#1a1c1c] dark:text-gray-300 tracking-[0.28px]">Lets Help You</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fec700] inline-block" />
            <span className="font-body text-[14px] text-[#1a1c1c] dark:text-gray-300 tracking-[0.28px]">Ask Any thing</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left — heading */}
          <div className="lg:col-span-1">
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="font-heading font-medium text-[#27731e] text-[42px] md:text-[58px] leading-[0.84] tracking-[1.16px]"
            >
              Frequently
              <br />
              Asked
              <br />
              Questions
            </motion.h2>
          </div>

          {/* Center — image */}
          <div className="hidden lg:flex lg:col-span-1 items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative w-[340px] h-[360px] rounded-[20px] overflow-hidden"
            >
              <Image
                src="http://localhost:3845/assets/e916944e8315e2781641e77b74d4e5c0c669da3d.png"
                alt="FAQ illustration"
                fill
                className="object-cover"
                sizes="340px"
              />
            </motion.div>
          </div>

          {/* Right — FAQ accordions */}
          <div className="lg:col-span-1 flex flex-col">
            {FAQS.map((faq, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="border-b border-[#e0e0e0] dark:border-gray-700"
              >
                {/* Question row */}
                <button
                  onClick={() => toggle(idx)}
                  className="w-full flex items-center justify-between py-5 text-left gap-4"
                >
                  <span className="font-heading font-semibold text-[#27731e] text-[20px] md:text-[24px] tracking-[0.48px] leading-[1.05]">
                    {faq.q}
                  </span>
                  <span
                    className={[
                      "flex-shrink-0 flex items-center justify-center w-[34px] h-[34px] rounded-full border-2 transition-all",
                      openIndex === idx
                        ? "border-[#27731e] bg-[#27731e] text-white rotate-90"
                        : "border-[#c0c0c0] dark:border-gray-600 text-[#1a1c1c] dark:text-gray-300",
                    ].join(" ")}
                    style={{ transform: openIndex === idx ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                  >
                    <Icon
                      icon={openIndex === idx ? "mdi:chevron-right" : "mdi:chevron-right"}
                      width={18}
                    />
                  </span>
                </button>

                {/* Answer */}
                <AnimatePresence initial={false}>
                  {openIndex === idx && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="font-body text-[#1a1c1c] dark:text-gray-400 text-[16px] md:text-[20px] tracking-[0.4px] pb-5 leading-[1.5]">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}

            {/* See more FAQs button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.35 }}
              className="flex justify-end mt-8"
            >
              <Link
                href="/contact#faq"
                className="inline-flex items-center gap-2 border border-black dark:border-gray-600 rounded-full px-7 py-4 font-body font-medium text-[#27731e] text-[15px] tracking-[0.3px] hover:bg-[#27731e] hover:text-white hover:border-[#27731e] transition-all"
              >
                See more FAQs
                <Icon icon="mdi:chevron-right" width={20} />
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
