"use client";

import { PRICE_MIN, PRICE_MAX, clampPrice, snapToStep } from "@/lib/price-range-steps";

interface PriceRangeSliderProps {
  value: { min: number; max: number };
  onChange: (value: { min: number; max: number }) => void;
  className?: string;
}

// Two overlapping native <input type="range"> elements — a well-known
// accessible dual-handle pattern (free keyboard support, no new dependency)
// rather than a from-scratch pointer-drag implementation.
export function PriceRangeSlider({ value, onChange, className = "" }: PriceRangeSliderProps) {
  const min = clampPrice(value.min);
  const max = clampPrice(value.max);
  const minPct = ((min - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
  const maxPct = ((max - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;

  function handleMinChange(raw: number) {
    const snapped = Math.min(snapToStep(raw), max - 5);
    onChange({ min: clampPrice(snapped), max });
  }
  function handleMaxChange(raw: number) {
    const snapped = Math.max(snapToStep(raw), min + 5);
    onChange({ min, max: clampPrice(snapped) });
  }

  const trackCls =
    "absolute h-1.5 w-full appearance-none bg-transparent pointer-events-none " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none " +
    "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:bg-(--green-800) [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white " +
    "[&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-(--green-800) [&::-moz-range-thumb]:border-2 " +
    "[&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-pointer";

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text)">
          KES {min.toLocaleString("en-KE")}
        </span>
        <span className="font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text)">
          KES {max.toLocaleString("en-KE")}
        </span>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="absolute h-1.5 w-full rounded-full bg-(--neutral-200) dark:bg-(--dark-border)" />
        <div
          className="absolute h-1.5 rounded-full bg-(--green-700)"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          value={min}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          className={trackCls}
          aria-label="Minimum price"
        />
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          value={max}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          className={trackCls}
          aria-label="Maximum price"
        />
      </div>
    </div>
  );
}
