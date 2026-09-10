"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Download, X, CheckCircle2, AlertCircle } from "lucide-react";
import { ProgressRing } from "@/components/admin/exports/ProgressRing";
import { useExportDownload } from "@/hooks/use-export-download";

interface ExportProgressModalProps {
  open: boolean;
  exportRequestId: string | null;
  /** Hides the modal — the download itself keeps running in the background;
      the AdminHeader icon (always mounted, always polling) picks it back up. */
  onClose: () => void;
}

export function ExportProgressModal({ open, exportRequestId, onClose }: ExportProgressModalProps) {
  const { progress, status, fileName } = useExportDownload(exportRequestId, { autoStart: true });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/45 z-[70]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[380px] bg-white dark:bg-(--dark-surface) rounded-[16px] shadow-(--e3) z-[70] p-6"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-(--neutral-400) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
              aria-label="Minimize"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col items-center text-center gap-4 pt-2">
              <ProgressRing percent={status === "done" ? 100 : progress} size={88} strokeWidth={5}>
                {status === "done" ? (
                  <CheckCircle2 size={30} className="text-(--green-700)" />
                ) : status === "error" ? (
                  <AlertCircle size={28} className="text-(--danger)" />
                ) : (
                  <Download size={28} className="text-(--green-800)" />
                )}
              </ProgressRing>

              <div>
                <div className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                  {status === "done" ? "Saved to your device" : status === "error" ? "Download failed" : "Preparing your download…"}
                </div>
                <div className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted) mt-1">
                  {status === "downloading" && `${progress}% · ${fileName ?? "export"}`}
                  {status === "done" && fileName}
                  {status === "error" && "Something went wrong — try again from Export."}
                  {status === "idle" && "Starting…"}
                </div>
              </div>

              <button
                onClick={onClose}
                className="mt-1 h-10 px-5 rounded-[10px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
              >
                {status === "downloading" ? "Continue in background" : "Done"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
