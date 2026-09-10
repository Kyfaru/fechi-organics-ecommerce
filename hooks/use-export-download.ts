"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface DownloadState {
  progress: number; // 0-100
  status: "idle" | "downloading" | "done" | "error";
  fileName?: string;
}

const IDLE: DownloadState = { progress: 0, status: "idle" };

/**
 * Streams a generated export via the same-origin download-proxy
 * (GET /api/admin/exports/[id]/download), tracking real byte progress via
 * Content-Length + a ReadableStream reader (not a fake timed animation),
 * then auto-saves the file client-side once complete.
 *
 * State lives in the React Query cache keyed by exportRequestId so multiple
 * mounted consumers of the same id (the header icon, which always
 * auto-starts once an export is READY, and the progress modal, opened
 * on-demand) share one in-flight download instead of double-fetching — the
 * "claim" check against the shared cache before starting is what prevents
 * the duplicate fetch.
 */
export function useExportDownload(exportRequestId: string | null, opts: { autoStart?: boolean } = {}) {
  const qc = useQueryClient();
  const key = ["export-download", exportRequestId];
  const claimedRef = useRef(false);

  const { data } = useQuery<DownloadState>({
    queryKey: key,
    queryFn: () => IDLE,
    enabled: !!exportRequestId,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: IDLE,
  });

  async function start() {
    if (!exportRequestId || claimedRef.current) return;
    const current = qc.getQueryData<DownloadState>(key);
    if (current && current.status !== "idle" && current.status !== "error") return; // already claimed elsewhere
    claimedRef.current = true;
    qc.setQueryData<DownloadState>(key, { progress: 0, status: "downloading" });

    try {
      const res = await fetch(`/api/admin/exports/${exportRequestId}/download`);
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);

      const total = Number(res.headers.get("Content-Length") ?? 0);
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "export";

      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          const progress = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
          qc.setQueryData<DownloadState>(key, { progress, status: "downloading", fileName });
        }
      }

      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      qc.setQueryData<DownloadState>(key, { progress: 100, status: "done", fileName });
    } catch (e) {
      console.error("[use-export-download]", e);
      qc.setQueryData<DownloadState>(key, { progress: 0, status: "error" });
    }
  }

  useEffect(() => {
    if (opts.autoStart && exportRequestId) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportRequestId, opts.autoStart]);

  return { ...(data ?? IDLE), start };
}
