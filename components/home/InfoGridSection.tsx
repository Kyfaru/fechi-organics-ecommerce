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
    title: "Free home\ndelivery",
    href: "/shop",
  },
  {
    bg: "#ffe37c",
    icon: "mdi:cash-multiple",
    title: "Pay on\nDelivery",
    href: "/shop",
  },
];

export function InfoGridSection() {
  return (
    <section className="py-16 px-4 md:px-8 bg-white dark:bg-gray-950">
      <div className="max-w-[1440px] mx-auto">
        {/* Top row — 3 feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          {FEATURE_CARDS.map((card, idx) => (
            <motion.div
              key={card.title}
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
                  <Icon icon="mdi:chevron-right" width={18} className="text-[#1a1c1c]" />
                </Link>
              </div>

              {/* Icon */}
              <div className="w-[88px] h-[88px] flex items-center justify-center">
                <Icon icon={card.icon} width={56} className="text-[#1a1c1c]" />
              </div>

              {/* Text */}
              <div>
                <h3
                  className="font-body font-semibold text-[#1a1c1c] text-[26px] md:text-[30px] tracking-[-0.3px] leading-[1.03] whitespace-pre-line"
                >
                  {card.title}
                </h3>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom row — 2 big promo cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Natural Tummy Tea card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative bg-[#27731e] rounded-[29px] overflow-hidden h-[360px] md:h-[396px] flex items-end"
          >
            {/* Tea image — left side */}
            <div className="absolute left-0 bottom-0 w-[50%] h-full">
              <Image
                src="http://localhost:3845/assets/4a7a0e057b6cdd25449179ea51546597b63a8e09.png"
                alt="Natural Tummy Tea"
                fill
                className="object-contain object-bottom"
                sizes="300px"
              />
            </div>

            {/* Text + CTA — right side */}
            <div className="relative z-10 flex flex-col justify-end p-8 ml-auto w-[54%]">
              <h3 className="font-body text-[#7fde6c] text-[26px] md:text-[30px] tracking-[0.6px] leading-[1.2] mb-3">
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
            className="relative bg-[#e4abff] rounded-[29px] overflow-hidden h-[360px] md:h-[396px]"
          >
            {/* Woman image */}
            <div className="absolute left-0 top-0 w-[55%] h-full">
              <Image
                src="http://localhost:3845/assets/a0c7881967cfb65060a29b299cc8b4b9272ab9f8.png"
                alt="We Are Near To You"
                fill
                className="object-cover object-top"
                sizes="300px"
              />
            </div>

            {/* Text + CTA — right side */}
            <div className="absolute right-0 top-0 bottom-0 w-[50%] flex flex-col justify-between p-8">
              <h3 className="font-body text-[#1a1c1c] text-[26px] md:text-[30px] tracking-[0.6px] leading-[1.2]">
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
