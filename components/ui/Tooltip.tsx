"use client";

import { useState, useRef } from "react";

type TooltipProps = {
  label: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
};

/** Custom hover tooltip wrapper for icon-only buttons. */
export function Tooltip({ label, children, position = "bottom" }: TooltipProps) {
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
      className="relative inline-flex"
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
