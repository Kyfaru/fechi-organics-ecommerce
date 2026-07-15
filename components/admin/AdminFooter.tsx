"use client";

import Link from "next/link";
import Image from "next/image";

export function AdminFooter() {
  return (
    <footer className="border-t border-(--green-800) dark:border-(--dark-border) bg-(--green-900) dark:bg-(--dark-surface) px-8 py-4 font-dm text-[12px] text-white/70 dark:text-(--dark-muted) flex items-center justify-between">
      <span>© {new Date().getFullYear()} Fechi Organics. All rights reserved.</span>
      <span>Build by <span className="flex gap-1"><Link href="https://kyfaru.com" target="_blank" rel="noopener noreferrer"><Image src="logo/Kyfaru-Logo-Filled-07.png" alt="Kyfaru" width={100} height={100} className="object-contain w-14 h-14" /> Kyfaru</Link></span></span>
      <a href="/terms" className="hover:text-white dark:hover:text-(--dark-text) transition-colors">
        Terms and Conditions
      </a>
    </footer>
  );
}
