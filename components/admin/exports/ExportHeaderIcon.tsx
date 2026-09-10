"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, CheckCircle2 } from "lucide-react";
import { ProgressRing } from "@/components/admin/exports/ProgressRing";
import { ExportProgressModal } from "@/components/admin/exports/ExportProgressModal";
import { useExportDownload } from "@/hooks/use-export-download";
import { useNotificationStream } from "@/hooks/use-notification-stream";

interface MineResponse {
  ok: boolean;
  data: { exportRequest: { id: string; status: string; fileName: string | null } | null };
}

/**
 * The header's own export-progress indicator — placed before the WhatsApp
 * icon. Always mounted (AdminHeader is part of the persistent admin layout),
 * so it's the thing that makes the "employee never has to click anything
 * after approval" requirement work: it discovers a READY export via polling
 * (ownership-scoped, so it only ever shows the caller's own exports) and
 * auto-starts the real download, independent of whether any modal is open.
 */
export function ExportHeaderIcon() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data } = useQuery<MineResponse>({
    queryKey: ["admin-exports-mine"],
    queryFn: () => fetch("/api/admin/exports/mine").then((r) => r.json()),
    refetchInterval: 15_000,
  });

  useNotificationStream(true, () => qc.invalidateQueries({ queryKey: ["admin-exports-mine"] }));

  const found = data?.data?.exportRequest;

  // Adopt a newly-discovered READY export as the one we're tracking. Once
  // adopted, we keep showing it regardless of what /mine says next — the
  // server marks deliveredAt as soon as the download starts being served,
  // so /mine stops listing it almost immediately, well before the client
  // has actually finished streaming/saving it. Clearing on that signal
  // instead of on our own download status would make the ring disappear
  // mid-download.
  useEffect(() => {
    if (found?.status === "READY" && !activeId) setActiveId(found.id);
  }, [found, activeId]);

  const { progress, status } = useExportDownload(activeId, { autoStart: true });

  // Clear the tracked export a few seconds after it finishes, so the icon
  // returns to hidden instead of sitting at a permanent checkmark.
  useEffect(() => {
    if (status !== "done" && status !== "error") return;
    const t = setTimeout(() => setActiveId(null), status === "done" ? 4000 : 8000);
    return () => clearTimeout(t);
  }, [status]);

  if (!activeId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="Export download progress"
        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) transition-colors"
      >
        <ProgressRing percent={status === "done" ? 100 : progress} size={30} strokeWidth={2.5}>
          {status === "done" ? (
            <CheckCircle2 size={14} className="text-(--green-700)" />
          ) : (
            <Download size={13} className="text-(--green-800)" />
          )}
        </ProgressRing>
      </button>

      <ExportProgressModal open={modalOpen} exportRequestId={activeId} onClose={() => setModalOpen(false)} />
    </>
  );
}
