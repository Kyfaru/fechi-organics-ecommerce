"use client";

/**
 * Switch — animated toggle.
 *
 * Visual spec:
 *   Width: 46px, Height: 24px, Circle diameter: 18px
 *   Off → gray bg rgb(131,131,131), cross icon (6px, gray tint) visible inside circle
 *   On  → green bg rgb(0,218,80), checkmark (10px, green tint) visible inside circle
 *   Circle transitions with cubic-bezier(0.27, 0.2, 0.25, 1.51) over 0.2s
 *   Slider ::before creates a subtle horizontal highlight / "ripple line" across the track
 *
 * Props: { checked, onChange, disabled? }
 * Styles: app/globals.css (.switch-*)
 */

import React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Inline SVG icons — rendered inside the thumb
// ---------------------------------------------------------------------------

/** White cross icon, 6×6 */
function CrossIcon() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
      <line x1="0.75" y1="0.75" x2="5.25" y2="5.25" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.25" y1="0.75" x2="0.75" y2="5.25" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** White checkmark, 10×7 */
function CheckmarkIcon() {
  return (
    <svg width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true">
      <polyline
        points="1,3.5 3.8,6 9,1"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Switch({ checked, onChange, disabled = false }: SwitchProps) {
  return (
    <label
      className={cn(
        "switch-label relative inline-block w-[46px] h-6 shrink-0",
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      )}
    >
      <input
        type="checkbox"
        className="absolute inset-0 w-full h-full m-0 opacity-0 z-[1] cursor-inherit"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        aria-checked={checked}
      />
      <span
        className={cn("switch-slider absolute inset-0 rounded-xl pointer-events-none", disabled && "opacity-50")}
        style={{ background: checked ? "rgb(0, 218, 80)" : "rgb(131, 131, 131)" }}
      >
        <span
          className="switch-thumb absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white flex items-center justify-center"
          style={{
            left: checked ? "25px" : "3px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.05)",
          }}
        >
          {checked ? <CheckmarkIcon /> : <CrossIcon />}
        </span>
      </span>
    </label>
  );
}
