"use client";

/**
 * CheckboxGreen — SVG animated checkbox (checkbox-wrapper-31 style).
 *
 * Visual:
 *   40×40 container with hidden <input type="checkbox"> (opacity 0, full-size).
 *   SVG layers:
 *     .background — filled circle: #ccc (unchecked) → #6cbe45 (checked), ease 0.6s
 *     .stroke     — white ring, stroke-dasharray animation on check
 *     .check      — white polyline checkmark, stroke-dasharray animation on check
 *   Hover: checkmark starts animating (dashoffset moves to 50 as a preview)
 *   Transitions: ease all 0.6s
 *
 * Props: { checked, onChange?, disabled?, className? }
 * Styles: app/globals.css (.checkbox-green-*) — kept in globals so multiple
 * instances on one page don't each inject their own <style>/keyframes.
 */

import React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface CheckboxGreenProps {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CheckboxGreen({
  checked,
  onChange,
  disabled = false,
  className,
}: CheckboxGreenProps) {
  return (
    <label
      className={cn(
        "checkbox-green-wrapper relative inline-flex items-center justify-center w-10 h-10 shrink-0 [&_input]:absolute [&_input]:inset-0 [&_input]:w-full [&_input]:h-full [&_input]:m-0 [&_input]:opacity-0 [&_input]:cursor-inherit [&_svg]:block [&_svg]:pointer-events-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange?.(e.target.checked)}
        disabled={disabled}
        aria-checked={checked}
      />

      <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* Filled background circle */}
        <circle
          className="checkbox-green-bg"
          cx="20"
          cy="20"
          r="18"
          fill={checked ? "#6cbe45" : "#cccccc"}
        />

        {/*
          Stroke ring — SVG circumference of r=18 circle ≈ 113.
          Starts at 12 o'clock via transform.
        */}
        <circle
          className="checkbox-green-stroke"
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          strokeDashoffset={checked ? 0 : 113}
          style={{
            transformOrigin: "20px 20px",
            transform: "rotate(-90deg)",
          }}
        />

        {/* Checkmark polyline */}
        <polyline
          className="checkbox-green-check"
          data-checked={checked}
          points="11,20 17,26.5 29,13"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDashoffset={checked ? 0 : 30}
        />
      </svg>
    </label>
  );
}
