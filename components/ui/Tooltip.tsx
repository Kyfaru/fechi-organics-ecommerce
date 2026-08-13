"use client";

import { useState, useRef } from "react";

type TooltipProps = {
  label: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
  /** Extra classes merged onto the wrapper div — e.g. "w-full" so a
   *  full-width child button isn't shrink-wrapped by the default inline-flex. */
  className?: string;
};

/** Custom hover tooltip wrapper for icon-only buttons. */
export function Tooltip({ label, children, position = "bottom", className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  function show() {
    timer.current = setTimeout(() => setVisible(true), 300);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  return (
    <div
      className={["relative inline-flex", className].filter(Boolean).join(" ")}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={[
            "absolute z-50 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-body text-white bg-[#1a1c1c]/90 pointer-events-none select-none shadow-lg",
            "left-1/2 -translate-x-1/2",
            position === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
          ].join(" ")}
        >
          {label}
        </span>
      )}
    </div>
  );
}
