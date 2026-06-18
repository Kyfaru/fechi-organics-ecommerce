"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { CategoryItem } from "@/lib/queries/categories";

type Props = {
  categories: CategoryItem[];
};

export function CategoriesSection({ categories }: Props) {
  return (
    <section className="py-16 px-4 md:px-8 bg-[#f4fff3] dark:bg-gray-950">
      <div className="max-w-[1440px] mx-auto">
        {/* Section heading */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center font-heading font-semibold text-[#1a1c1c] dark:text-white text-[40px] md:text-[58px] tracking-[-1.16px] mb-12"
        >
          Popular Categories
        </motion.h2>

        {/* Category circles */}
        <div className="flex flex-wrap items-end justify-center gap-8 md:gap-12">
          {categories.map((cat, idx) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="flex flex-col items-center gap-4"
            >
              <Link href={`/shop?category=${cat.slug}`} className="group flex flex-col items-center gap-3">
                {/* Circular image */}
                <motion.div
                  whileHover={{ scale: 1.07 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative w-[160px] h-[160px] md:w-[210px] md:h-[210px] rounded-full overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)] group-hover:shadow-[0_8px_30px_rgba(39,115,30,0.25)] transition-shadow"
                >
                  <Image
                    src={cat.imageUrl}
                    alt={cat.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 160px, 210px"
                  />
                </motion.div>

                {/* Label */}
                <span className="font-body text-[18px] md:text-[20px] text-[#1a1c1c] dark:text-gray-200 tracking-[-0.2px] text-center group-hover:text-[#27731e] transition-colors">
                  {cat.name}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
