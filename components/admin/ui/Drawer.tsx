"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, ChevronLeft } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 480 | 640;
  /** Ask "close without saving?" if the user typed/changed a field. Off for view-only drawers and ones with their own guard. */
  confirmClose?: boolean;
}

// Phones get a full-page "push" screen (slides in from the right while the page
// behind shifts left via body[data-drawer-open] in globals.css); sm+ keeps the
// right-hand side panel.
function subscribeMobile(cb: () => void) {
  const mq = window.matchMedia("(max-width: 639px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const noop = () => () => {};

export function Drawer({ open, onClose, title, children, footer, width = 640, confirmClose = true }: DrawerProps) {
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia("(max-width: 639px)").matches, () => false);
  const reduce = useReducedMotion();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  const id = useId();
  const dirtyRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => { if (open) dirtyRef.current = false; }, [open]);
  // ponytail: dirty = any input/change event inside the drawer; catches typing/selecting, not programmatic edits
  const requestClose = useCallback(() => {
    if (confirmClose && dirtyRef.current) setConfirmOpen(true);
    else onClose();
  }, [confirmClose, onClose]);
  const onCloseRef = useRef(requestClose);
  useEffect(() => { onCloseRef.current = requestClose; });

  // Phone Back button closes the drawer: each open drawer owns one history entry.
  useEffect(() => {
    if (!open || !mobile) return;
    history.pushState({ ...history.state, __drawer: id }, "");
    let popped = false;
    const onPop = () => {
      if (confirmClose && dirtyRef.current) {
        // stay open: restore our history entry and ask first
        history.pushState({ ...history.state, __drawer: id }, "");
        setConfirmOpen(true);
        return;
      }
      popped = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // closed via UI (X/save/backdrop): drop our now-dead entry
      if (!popped && history.state?.__drawer === id) history.back();
    };
  }, [open, mobile, id, confirmClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !confirmOpen && requestClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.drawerOpen = String(Number(document.body.dataset.drawerOpen ?? 0) + 1);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const n = Number(document.body.dataset.drawerOpen ?? 1) - 1;
      if (n <= 0) delete document.body.dataset.drawerOpen;
      else document.body.dataset.drawerOpen = String(n);
    };
  }, [open, requestClose, confirmOpen]);

  if (!mounted) return null;

  const transition = reduce
    ? { duration: 0 }
    : mobile
      ? { type: "tween" as const, ease: [0.32, 0.72, 0, 1] as const, duration: 0.32 }
      : { type: "spring" as const, stiffness: 420, damping: 38 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="fixed inset-0 bg-black/45 z-[35] max-sm:hidden"
            onClick={requestClose}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={transition}
            onInputCapture={() => { dirtyRef.current = true; }}
            onChangeCapture={() => { dirtyRef.current = true; }}
            style={{ ["--drawer-w" as string]: `${width}px` }}
            className="fixed right-0 top-0 h-dvh w-full sm:w-(--drawer-w) bg-white dark:bg-(--dark-surface) z-[36] flex flex-col shadow-(--e3) sm:border-l border-(--neutral-200) dark:border-(--dark-border)"
          >
            <div className="h-14 sm:h-16 flex items-center gap-1 sm:justify-between px-2 sm:px-6 border-b border-(--neutral-200) dark:border-(--dark-border) bg-(--green-50) dark:bg-(--dark-bg) shrink-0">
              <button
                onClick={requestClose}
                aria-label="Back"
                className="sm:hidden w-10 h-10 flex items-center justify-center rounded-[8px] text-(--green-800) dark:text-(--dark-accent) active:bg-(--green-100) dark:active:bg-(--dark-border)"
              >
                <ChevronLeft size={22} />
              </button>
              <h3 className="flex-1 truncate font-syne text-[16px] sm:text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">{title}</h3>
              <button
                onClick={requestClose}
                aria-label="Close"
                className="max-sm:hidden w-8 h-8 flex items-center justify-center rounded-[6px] text-(--green-800) dark:text-(--dark-accent) hover:bg-(--green-100) dark:hover:bg-(--dark-border) transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 bg-white dark:bg-(--dark-surface)">{children}</div>
            {footer && (
              <div className="min-h-16 flex flex-wrap items-center px-4 sm:px-6 py-2 gap-3 border-t border-(--neutral-200) dark:border-(--dark-border) bg-(--green-50) dark:bg-(--dark-bg) shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
      <ConfirmModal
        key="discard"
        open={open && confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); dirtyRef.current = false; onClose(); }}
        title="Close without saving?"
        description="You have unsaved changes. If you close now, they will be lost."
        confirmLabel="Close without saving"
        danger
      />
    </AnimatePresence>,
    document.body,
  );
}
