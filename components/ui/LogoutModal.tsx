"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Confirmation dialog before signing the user out.
 * Caller supplies onConfirm (typically: call signOut() then redirect).
 */
export function LogoutModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      onClose(); // close BEFORE setLoading(false) so AnimatePresence exit fires
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="logout-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 z-[100]"
            onClick={onClose}
          />
          {/* Card */}
          <motion.div
            key="logout-card"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-neutral-900 rounded-[20px] p-8 max-w-sm w-[calc(100vw-2rem)] shadow-xl"
          >
            <h2 className="font-heading text-[20px] font-bold text-[#1a1c1c] dark:text-white mb-2">
              Sign out?
            </h2>
            <p className="text-sm text-[#6b7280] dark:text-neutral-400 mb-6">
              You&apos;ll need to log in again to access your account.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 rounded-full border border-[#c0cab8] dark:border-neutral-700 text-[#1a1c1c] dark:text-white text-sm font-body hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-5 py-2.5 rounded-full bg-red-500 text-white text-sm font-body hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {loading && (
                  <Icon icon="mdi:loading" width={16} className="animate-spin" />
                )}
                Sign Out
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
