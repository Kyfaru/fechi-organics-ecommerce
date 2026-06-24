"use client";

/**
 * CircularProgress — pure SVG + Tailwind circular progress ring.
 *
 * Uses a linearGradient: #22c55e (green-500) → #4ade80 (green-400).
 * Arc animates via CSS transition on stroke-dashoffset (0.3s ease).
 * Center text shows the percentage integer.
 *
 * Props: { percent: 0–100, size?: number (default 64), strokeWidth?: number (default 6) }
 */

import React, { useId } from "react";

export interface CircularProgressProps {
  /** 0–100 */
  percent: number;
  /** Outer diameter in px. Default: 64 */
  size?: number;
  /** Ring thickness in px. Default: 6 */
  strokeWidth?: number;
}

export default function CircularProgress({
  percent,
  size = 64,
  strokeWidth = 6,
}: CircularProgressProps) {
  // useId ensures unique gradient IDs when multiple instances appear on the same page
  const uid = useId().replace(/:/g, "");
  const gradientId = `cpg-${uid}`;

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;
  const fontSize = Math.round(size * 0.22);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${Math.round(clamped)}%`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#22c55e" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
      </defs>

      {/* Track — light gray background ring */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />

      {/* Fill arc */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{
          transformOrigin: `${center}px ${center}px`,
          transform: "rotate(-90deg)",
          transition: "stroke-dashoffset 0.3s ease",
        }}
      />

      {/* Percentage label */}
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="600"
        fill="#1a1c1c"
        fontFamily="var(--font-dm-var, system-ui, sans-serif)"
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
