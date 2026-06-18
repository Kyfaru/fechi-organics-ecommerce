"use client";

import Link from "next/link";

const STEPS = [
  { num: 1, label: "Cart", href: "/cart" },
  { num: 2, label: "Delivery", href: "/delivery" },
  { num: 3, label: "Payment", href: "/payment" },
];

interface StepIndicatorProps {
  step: 1 | 2 | 3;
}

export function StepIndicator({ step }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center w-full max-w-[540px] mx-auto relative">
      {/* Connector line behind the circles */}
      <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-[#e2e2e2] dark:bg-gray-700 z-0" />

      {STEPS.map((s) => {
        const isActive = s.num === step;
        const isCompleted = s.num < step;
        return (
          <div key={s.num} className="flex-1 flex flex-col items-center relative z-10">
            <div
              className={[
                "w-10 h-10 rounded-full flex items-center justify-center border-2 font-body font-bold text-[18px]",
                isActive
                  ? "bg-[#045a03] border-[#045a03] text-white"
                  : isCompleted
                  ? "bg-[#27731e] border-[#27731e] text-white"
                  : "bg-white dark:bg-gray-800 border-[#e2e2e2] dark:border-gray-600 text-[#707a6b] dark:text-gray-400",
              ].join(" ")}
            >
              {s.num}
            </div>
            <span
              className={[
                "mt-2 font-body text-[13px]",
                isActive
                  ? "text-[#045a03] font-bold"
                  : "text-[#40493c] dark:text-gray-400",
              ].join(" ")}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
