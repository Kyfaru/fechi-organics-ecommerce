"use client";

import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 480 | 640;
}

export function Drawer({ open, onClose, title, children, footer, width = 480 }: DrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/45 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.2 }}
            style={{ width }}
            className="fixed right-0 top-0 h-full bg-white dark:bg-[--dark-surface] z-50 flex flex-col shadow-[--e3]"
          >
            <div className="h-16 flex items-center justify-between px-6 border-b border-[--neutral-200] dark:border-[--dark-border] shrink-0">
              <h3 className="font-syne text-[18px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">{title}</h3>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-[6px] text-[--neutral-500] hover:bg-[--neutral-100] dark:hover:bg-[--dark-border] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
            {footer && (
              <div className="h-16 flex items-center px-6 gap-3 border-t border-[--neutral-200] dark:border-[--dark-border] bg-white dark:bg-[--dark-surface] shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
