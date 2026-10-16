"use client";

import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export function ConfirmModal({
  open, onClose, onConfirm, title, description,
  confirmLabel = "Confirm", danger = false, loading = false, children,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/45 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2 }}
            className="fixed z-50 bg-white dark:bg-(--dark-surface) shadow-(--e3) p-5 sm:p-6 max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-[16px] max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-[480px] sm:rounded-[12px]"
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${danger ? "bg-(--danger-bg)" : "bg-(--gold-50)"}`}>
                <AlertTriangle size={20} className={danger ? "text-(--danger)" : "text-(--gold-700)"} />
              </div>
              <div className="flex-1">
                <h3 className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text) mb-1">{title}</h3>
                <p className="font-dm text-[14px] text-(--neutral-500) dark:text-(--dark-muted)">{description}</p>
              </div>
            </div>
            {children && <div className="mt-4">{children}</div>}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-6 [&>button]:max-sm:h-11">
              <button
                onClick={onClose}
                className="h-10 px-5 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`h-10 px-5 rounded-[8px] font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60 ${
                  danger ? "bg-(--danger) hover:opacity-90" : "bg-(--green-800) hover:bg-(--green-900)"
                }`}
              >
                {loading ? "Loading…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
