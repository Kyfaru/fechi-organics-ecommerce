"use client";

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
}

export function ConfirmModal({
  open, onClose, onConfirm, title, description,
  confirmLabel = "Confirm", danger = false, loading = false,
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
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[480px] bg-white dark:bg-[--dark-surface] rounded-[12px] shadow-[--e3] z-50 p-6"
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${danger ? "bg-[--danger-bg]" : "bg-[--gold-50]"}`}>
                <AlertTriangle size={20} className={danger ? "text-[--danger]" : "text-[--gold-700]"} />
              </div>
              <div className="flex-1">
                <h3 className="font-syne text-[18px] font-semibold text-[--neutral-900] dark:text-[--dark-text] mb-1">{title}</h3>
                <p className="font-dm text-[14px] text-[--neutral-500] dark:text-[--dark-muted]">{description}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="h-10 px-5 rounded-[8px] border border-[--neutral-200] font-dm text-[14px] text-[--neutral-700] hover:bg-[--neutral-50] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`h-10 px-5 rounded-[8px] font-dm text-[14px] font-medium text-white transition-colors disabled:opacity-60 ${
                  danger ? "bg-[--danger] hover:opacity-90" : "bg-[--green-800] hover:bg-[--green-900]"
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
