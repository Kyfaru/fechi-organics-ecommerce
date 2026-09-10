"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";

const AUTO_CLOSE_MS = 10_000;

interface ContactSuccessModalProps {
  open: boolean;
  ticketNumber?: string;
  onClose: () => void;
}

/**
 * Success confirmation shown right after a contact-form submission.
 * Auto-dismisses after 10s (or on backdrop/button click); the caller
 * fires a follow-up toast from onClose so there's always a lingering
 * confirmation even after this modal is gone.
 */
export function ContactSuccessModal({ open, ticketNumber, onClose }: ContactSuccessModalProps) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-success-title"
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-[440px] bg-white dark:bg-gray-900 rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.25)] z-50 p-8 text-center"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 text-[#a1a1a1] hover:text-[#1a1c1c] dark:hover:text-white transition-colors"
            >
              <Icon icon="mdi:close" width={20} />
            </button>

            <div className="w-16 h-16 rounded-full bg-[#e8fce3] dark:bg-green-900/30 flex items-center justify-center mx-auto mb-5">
              <Icon icon="mdi:check-circle" width={36} className="text-[#27731e] dark:text-green-400" />
            </div>

            <h2
              id="contact-success-title"
              className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[24px] mb-2"
            >
              Message Sent!
            </h2>

            {ticketNumber && (
              <p className="font-body text-[#40493c] dark:text-gray-400 text-[14px] mb-1">
                Your ticket number is{" "}
                <span className="font-semibold text-[#1a1c1c] dark:text-white">{ticketNumber}</span>
              </p>
            )}

            <p className="font-body text-[#40493c] dark:text-gray-400 text-[14px] leading-[1.6]">
              We&apos;ll get back to you within <span className="font-semibold">24 hours</span> during
              business days.
            </p>

            <button
              onClick={onClose}
              className="mt-6 w-full bg-[#27731e] hover:bg-[#1f5f18] text-white font-body font-semibold text-[14px] rounded-[40px] py-3 transition-colors"
            >
              Got it
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
