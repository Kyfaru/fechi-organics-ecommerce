"use client";

/**
 * DownloadButton — animated download pill with styled-components.
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
 */

import React, { useRef, useState } from "react";
import styled, { keyframes, css } from "styled-components";

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

/** Fill the circle from bottom to top (simulates download progress) */
const fillUp = keyframes`
  from { clip-path: inset(100% 0 0 0); }
  to   { clip-path: inset(0% 0 0 0); }
`;

// ---------------------------------------------------------------------------
// Props / State
// ---------------------------------------------------------------------------
export interface DownloadButtonProps {
  onDownload: () => Promise<void>;
  label?: string;
  className?: string;
}

type BtnState = "idle" | "loading";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------
const BLUE      = "rgb(91, 91, 240)";
const DARK_BLUE = "#3333a8";

/** Outer pill wrapper */
const Pill = styled.div<{ $state: BtnState }>`
  display: inline-flex;
  align-items: center;
  width: ${({ $state }) => ($state === "idle" ? "160px" : "57px")};
  height: 57px;
  border: 2px solid ${BLUE};
  border-radius: 30px;
  overflow: hidden;
  cursor: pointer;
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  user-select: none;
`;

/** Left circle — always visible */
const CircleBtn = styled.div<{ $state: BtnState }>`
  position: relative;
  width: 53px;
  height: 53px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
`;

/** Static background of circle when idle */
const CircleBg = styled.div`
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: transparent;
`;

/** Animated fill layer — clips from bottom */
const CircleFill = styled.div<{ $active: boolean }>`
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: ${DARK_BLUE};
  clip-path: inset(100% 0 0 0);
  ${({ $active }) =>
    $active &&
    css`
      animation: ${fillUp} 3.5s linear forwards;
    `}
`;

/** Icon container (sits above fill layer) */
const IconWrap = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${BLUE};
`;

/** Label to the right of circle — only shown in idle */
const Label = styled.span<{ $visible: boolean }>`
  flex: 1;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: ${BLUE};
  font-family: var(--font-dm-var, system-ui, sans-serif);
  white-space: nowrap;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 0.2s ease;
  padding-right: 14px;
`;

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
    <Pill $state={state} className={className} onClick={handleClick} role="button" aria-label={label}>
      <CircleBtn $state={state}>
        <CircleBg />
        <CircleFill $active={isLoading} />
        <IconWrap>
          {isLoading ? <StopIcon color={iconColor} /> : <ArrowDown color={iconColor} />}
        </IconWrap>
      </CircleBtn>

      {/* Label — only meaningful in idle; collapses with the pill when loading */}
      <Label $visible={!isLoading}>{label}</Label>
    </Pill>
  );
}
