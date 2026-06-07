"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { useCurrency } from "@/app/providers";
import type { CurrencyCode } from "@/lib/currency";

export function CurrencySwitcher() {
  const { currency, setCurrency, currencies } = useCurrency();
  const [open, setOpen] = useState(false);

  const current = currencies.find((c) => c.code === currency) ?? currencies[0];

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 bg-white rounded-2xl shadow-xl border border-[#c0cab8] overflow-hidden min-w-[160px]">
          {currencies.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setCurrency(c.code as CurrencyCode);
                setOpen(false);
              }}
              className={[
                "w-full flex items-center gap-2 px-4 py-2.5 text-[14px] font-body text-left transition-colors",
                c.code === currency
                  ? "bg-[#27731e] text-white"
                  : "text-[#1a1c1c] hover:bg-[#e8fce3]",
              ].join(" ")}
            >
              <span className="w-6 text-center font-semibold">{c.symbol}</span>
              <span>{c.code}</span>
              <span className="text-[11px] opacity-70 ml-auto">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-white border border-[#c0cab8] rounded-2xl px-3 py-2 text-[13px] font-body text-[#1a1c1c] shadow-md hover:border-[#27731e] transition-colors"
        aria-label="Switch currency"
        aria-expanded={open}
      >
        <span className="font-semibold text-[#27731e]">{current.symbol}</span>
        <span>{current.code}</span>
        <Icon
          icon={open ? "mdi:chevron-down" : "mdi:chevron-up"}
          width={14}
          className="text-[#40493c]"
        />
      </button>
    </div>
  );
}
