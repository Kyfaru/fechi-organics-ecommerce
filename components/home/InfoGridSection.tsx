"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";

const FEATURE_CARDS = [
  {
    bg: "#ffe480",
    icon: "mdi:tag-outline",
    title: "Get Up to\n50% OFF",
    href: "/shop",
  },
  {
    bg: "#6cdecb",
    icon: "mdi:truck-delivery-outline",
    title: "24Hrs order\nDelivery",
    href: "/shop",
  },
  {
    bg: "#ffe37c",
    icon: "mdi:cash-multiple",
    title: "Quick Payment\nProcess",
    href: "/shop",
  },
];

type FeatureCardData = (typeof FEATURE_CARDS)[number];

function FeatureCard({ card, idx }: { card: FeatureCardData; idx: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: idx * 0.1 }}
      className="relative rounded-[31px] overflow-hidden h-[270px] md:h-[290px] flex flex-col justify-between p-7"
      style={{ backgroundColor: card.bg }}
    >
      {/* Top-right circle + chevron button */}
      <div className="absolute top-5 right-5">
        <Link
          href={card.href}
          className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-900 rounded-full shadow-sm hover:scale-110 transition-transform"
        >
          <Icon icon="mdi:chevron-right" width={18} className="text-[#1a1c1c] dark:text-[#ffc800]" />
        </Link>
      </div>

      {/* Icon */}
      <div className="w-[88px] h-[88px] flex items-center justify-center">
        <Icon icon={card.icon} width={56} className="text-[#1a1c1c]" />
      </div>

      {/* Text */}
      <div>
        <h3 className="font-body font-semibold text-[#1a1c1c] text-[26px] md:text-[30px] tracking-[-0.3px] leading-[1.03] whitespace-pre-line">
          {card.title}
        </h3>
      </div>
    </motion.div>
  );
}

export function InfoGridSection() {
  return (
    <section className="py-16 px-4 md:px-8 bg-white dark:bg-gray-950">
      <div className="max-w-[1440px] mx-auto">
        {/* Top row — 3 feature cards. Mobile: first two share a 2-col grid,
            third sits full-width below (not part of a grid). Desktop: all
            three stay in the original uniform 3-col grid via md:contents. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          <div className="grid grid-cols-2 gap-5 md:contents">
            {FEATURE_CARDS.slice(0, 2).map((card, idx) => (
              <FeatureCard key={card.title} card={card} idx={idx} />
            ))}
          </div>
          <FeatureCard card={FEATURE_CARDS[2]} idx={2} />
        </div>

        {/* Bottom row — 2 big promo cards. Hidden below 1200px (tablet); a
            normal stacked flow (image on top, text below) rather than the
            old grid-of-absolute-halves, so it's correct if ever unhidden. */}
        <div className="hidden tablet:grid tablet:grid-cols-2 gap-5">
          {/* Natural Tummy Tea card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex flex-col bg-[#27731e] rounded-[29px] overflow-hidden"
          >
            {/* Tea image */}
            <div className="relative h-[200px] w-full shrink-0">
              <Image
                src="img/tummy-tea-detox.png"
                alt="Natural Tummy Tea"
                fill
                className="object-contain object-bottom"
                sizes="400px"
              />
            </div>

            {/* Text + CTA */}
            <div className="flex flex-col p-8">
              <h3 className="font-body text-[#7fde6c] text-[26px] md:text-[30px] tracking-[0.6px] leading-[1.2] mb-5">
                Natural Tummy Tea
              </h3>
              <p className="font-body text-white text-[15px] md:text-[16px] tracking-[0.32px] leading-[1.39] mb-6 opacity-90">
                Refreshing tasty tea that also makes you glow.
              </p>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 bg-[#ffc800] text-[#1a1c1c] rounded-full px-6 py-4 font-body font-medium text-[15px] tracking-[0.3px] hover:brightness-95 transition-all w-fit"
              >
                Shop Now
                <Icon icon="mdi:chevron-right" width={20} />
              </Link>
            </div>
          </motion.div>

          {/* We Are Near To You card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col bg-[#e4abff] rounded-[29px] overflow-hidden"
          >
            {/* Woman image */}
            <div className="relative h-[200px] w-full shrink-0">
              <Image
                src="http://localhost:3845/assets/a0c7881967cfb65060a29b299cc8b4b9272ab9f8.png"
                alt="We Are Near To You"
                fill
                className="object-cover object-top"
                sizes="400px"
              />
            </div>

            {/* Text + CTA */}
            <div className="flex flex-col justify-between p-8 flex-1">
              <h3 className="font-body text-[#1a1c1c] font-semibold text-[26px] md:text-[30px] tracking-[0.6px] leading-[1.2]">
                We Are Near
                <br />
                To You
              </h3>
              <div>
                <p className="font-body text-[#1a1c1c] text-[14px] md:text-[16px] tracking-[0.32px] leading-[1.39] mb-6">
                  We have branches in Nairobi, Nakuru, Eldoret, Mwea and Kitengela.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 bg-white text-[#1a1c1c] rounded-full px-6 py-4 font-body font-medium text-[15px] tracking-[0.3px] hover:bg-[#f0f0f0] transition-all w-fit"
                >
                  Get In Touch
                  <Icon icon="mdi:chevron-right" width={20} />
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
