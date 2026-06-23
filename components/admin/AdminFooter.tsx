"use client";

export function AdminFooter() {
  return (
    <footer className="border-t border-(--green-800) dark:border-(--dark-border) bg-(--green-900) dark:bg-(--dark-surface) px-8 py-4 font-dm text-[12px] text-white/70 dark:text-(--dark-muted) flex items-center justify-between">
      <span>© {new Date().getFullYear()} Fechi Organics. All rights reserved.</span>
      <span>Created by Kyfaru</span>
      <a href="/terms" className="hover:text-white dark:hover:text-(--dark-text) transition-colors">
        Terms and Conditions
      </a>
    </footer>
  );
}
