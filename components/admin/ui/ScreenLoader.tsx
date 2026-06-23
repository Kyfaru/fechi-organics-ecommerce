"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ScreenLoaderProps {
  open: boolean;
  message?: string;
}

export function ScreenLoader({ open, message = "Loading…" }: ScreenLoaderProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center backdrop-blur-sm bg-black/30"
        >
          <div className="w-12 h-12 rounded-full border-4 border-(--green-200) border-t-(--green-500) dark:border-(--dark-border) dark:border-t-(--dark-accent) animate-spin mb-4" />
          <p className="font-dm text-[14px] text-white font-medium drop-shadow">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
