"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { ProductCard as ProductCardType } from "@/lib/queries/products";

type Props = {
  products: ProductCardType[];
};

const CARD_WIDTH = 220; // px — mobile scroller card wrapper width
const CARD_GAP = 24; // px — gap-6

export function BestSellersSection({ products }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const directionRef = useRef<1 | -1>(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function updateEdges() {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  function scrollByCard(dir: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: dir * (CARD_WIDTH + CARD_GAP), behavior: "smooth" });
  }

  // 3s ping-pong autoplay — scroll to the end, reverse, scroll back to the
  // start, loop — mirroring HeroSection's timerRef/isPaused autoplay pattern.
  useEffect(() => {
    if (products.length <= 1 || isPaused) return;

    timerRef.current = setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (directionRef.current === 1 && el.scrollLeft >= max - 1) directionRef.current = -1;
      else if (directionRef.current === -1 && el.scrollLeft <= 1) directionRef.current = 1;
      el.scrollBy({ left: directionRef.current * (CARD_WIDTH + CARD_GAP), behavior: "smooth" });
    }, 3000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, products.length]);

  function pause() {
    setIsPaused(true);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function resume() {
    setIsPaused(false);
  }

  return (
    <section className="py-16 px-4 md:px-8 bg-[#f4fff3] dark:bg-gray-950">
      <div className="max-w-[1440px] mx-auto">
        {/* Header row */}
        <div className="flex items-start justify-between mb-10">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="font-heading font-semibold text-[#27731e] text-[40px] md:text-[58px] tracking-[-1.16px] leading-[1.1] max-w-[440px]"
          >
            Todays Best
            <br />
            Deals For You!
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="hidden md:flex items-center mt-4"
          >
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 border border-black dark:border-gray-600 rounded-full px-6 py-3.5 font-body text-[14px] text-[#27731e] tracking-[0.28px] hover:bg-[#27731e] hover:text-white hover:border-[#27731e] transition-all"
            >
              See all products
              <span className="flex items-center justify-center w-[27px] h-[27px] bg-[#27731e] rounded-full text-white group-hover:bg-white group-hover:text-[#27731e] transition-colors">
                <Icon icon="mdi:chevron-right" width={16} />
              </span>
            </Link>
          </motion.div>
        </div>

        {/* Desktop — static grid, unchanged */}
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center">
          {products.map((product, idx) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="w-full max-w-[310px]"
            >
              <ProductCard product={product} />
            </motion.div>
          ))}
        </div>

        {/* Mobile — horizontal auto-scroller with edge arrows */}
        <div className="relative sm:hidden">
          <div
            ref={scrollerRef}
            onScroll={updateEdges}
            onTouchStart={pause}
            onTouchEnd={resume}
            onPointerDown={pause}
            onPointerUp={resume}
            className="flex overflow-x-auto gap-6 pb-2 touch-pan-x [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {products.map((product) => (
              <div key={product.id} className="shrink-0" style={{ width: CARD_WIDTH }}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>

          {!atStart && (
            <button
              onClick={() => scrollByCard(-1)}
              aria-label="Scroll left"
              className="absolute left-1 top-[100px] -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-[#27731e]"
            >
              <Icon icon="mdi:chevron-left" width={22} />
            </button>
          )}
          {!atEnd && (
            <button
              onClick={() => scrollByCard(1)}
              aria-label="Scroll right"
              className="absolute right-1 top-[100px] -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-[#27731e]"
            >
              <Icon icon="mdi:chevron-right" width={22} />
            </button>
          )}
        </div>

        {/* Mobile see all button */}
        <div className="flex md:hidden justify-center mt-8">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 border border-black dark:border-gray-600 rounded-full px-6 py-3.5 font-body text-[14px] text-[#27731e] tracking-[0.28px] hover:bg-[#27731e] hover:text-white hover:border-[#27731e] transition-all"
          >
            See all products
            <Icon icon="mdi:chevron-right" width={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
