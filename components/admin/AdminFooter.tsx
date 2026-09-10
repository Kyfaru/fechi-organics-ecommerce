"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

export function AdminFooter() {
  return (
    <footer className="border-t border-(--green-800) dark:border-(--dark-border) bg-(--green-900) dark:bg-(--dark-surface) px-8 py-4 font-dm text-[12px] text-white/70 dark:text-(--dark-muted) flex items-center justify-between">
      <span>© {new Date().getFullYear()} Fechi Organics. All rights reserved.</span>
      <span className="text-white/50 text-xs flex items-center gaspan-1">
  Powered by

  <Link
    href="https://kyfaru.com"
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-1 text-white"
  >
    <motion.div
      animate={{
        y: [0, -8, -8, -8, 0],
        rotate: [0, -3, 3, -3, 3, -2, 2, 0],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
        times: [0, 0.2, 0.35, 0.5, 1],
      }}
    >
      <Image
        src="/logo/Kyfaru-Logo-Filled-07.png"
        alt="Kyfaru"
        width={32}
        height={32}
        className="object-contain"
      />
    </motion.div>

    <span>Kyfaru</span>
  </Link>
</span>
      <a href="/terms" className="hover:text-white dark:hover:text-(--dark-text) transition-colors">
        Terms and Conditions
      </a>
    </footer>
  );
}
