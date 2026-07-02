"use client";

/**
 * DownloadButton — animated download pill.
 *
 * States:
 *   idle    → 160px wide pill; blue border (rgb(91,91,240)); circle button on left
 *             with down-arrow icon; "Download" label on right.
 *   loading → pill shrinks to 57px (circle only); circle fills with #3333a8
 *             from bottom over ~3.5 s; square stop icon replaces arrow.
 *   (done)  → onDownload() resolves → smoothly resets back to 160px idle.
 *             NO "Open" / "installed" end-state.
 *
 * Props: { onDownload: () => Promise<void>; label?: string; className?: string }
 * Styles: app/globals.css (.download-button-*)
 */

import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props / State
// ---------------------------------------------------------------------------
export interface DownloadButtonProps {
  onDownload: () => Promise<void>;
  label?: string;
  className?: string;
}

type BtnState = "idle" | "loading";

const BLUE = "rgb(91, 91, 240)";
const DARK_BLUE = "#3333a8";

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

/** Down-arrow icon */
function ArrowDown({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <line x1="11" y1="3" x2="11" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <polyline points="6,12 11,17 16,12" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Square stop icon (shown during loading) */
function StopIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="12" height="12" rx="2" fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DownloadButton({
  onDownload,
  label = "Download",
  className = "",
}: DownloadButtonProps) {
  const [state, setState] = useState<BtnState>("idle");
  // Ref to cancel reset if unmounted
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleClick() {
    if (state !== "idle") return;

    setState("loading");

    try {
      await onDownload();
    } catch {
      // Even on error, reset gracefully
    }

    // Wait for the fill animation to complete (3.5s) then reset
    resetTimer.current = setTimeout(() => {
      setState("idle");
    }, 3600);
  }

  // Cleanup on unmount to avoid setState on dead component
  React.useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const isLoading = state === "loading";
  const iconColor = isLoading ? "white" : BLUE;

  return (
    <div
      className={cn(
        "download-button-pill inline-flex items-center h-[57px] rounded-[30px] overflow-hidden cursor-pointer shrink-0 select-none",
        className
      )}
      style={{ width: isLoading ? "57px" : "160px", border: `2px solid ${BLUE}` }}
      onClick={handleClick}
      role="button"
      aria-label={label}
    >
      <div className="relative w-[53px] h-[53px] rounded-full shrink-0 overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-transparent" />
        <div
          className="download-button-fill absolute inset-0 rounded-full"
          data-active={isLoading}
          style={{ background: DARK_BLUE, clipPath: "inset(100% 0 0 0)" }}
        />
        <div className="relative z-10 flex items-center justify-center" style={{ color: BLUE }}>
          {isLoading ? <StopIcon color={iconColor} /> : <ArrowDown color={iconColor} />}
        </div>
      </div>

      {/* Label — only meaningful in idle; collapses with the pill when loading */}
      <span
        className="download-button-label flex-1 text-center text-sm font-semibold whitespace-nowrap pr-3.5"
        style={{
          color: BLUE,
          fontFamily: "var(--font-dm-var, system-ui, sans-serif)",
          opacity: isLoading ? 0 : 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}
