"use client";

export function AdminFooter() {
  return (
    <footer className="border-t border-[--neutral-200] dark:border-[--dark-border] px-8 py-4 font-dm text-[12px] text-[--neutral-500] dark:text-[--dark-muted] flex items-center justify-between">
      <span>© {new Date().getFullYear()} Fechi Organics. All rights reserved.</span>
      <span>Created by Kyfaru</span>
      <a href="/terms" className="hover:text-[--neutral-700] dark:hover:text-[--dark-text] transition-colors">
        Terms and Conditions
      </a>
    </footer>
  );
}
