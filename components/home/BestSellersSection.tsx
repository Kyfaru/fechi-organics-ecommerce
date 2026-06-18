"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { ProductCard as ProductCardType } from "@/lib/queries/products";

type Props = {
  products: ProductCardType[];
};

export function BestSellersSection({ products }: Props) {
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

        {/* Product cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center">
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
