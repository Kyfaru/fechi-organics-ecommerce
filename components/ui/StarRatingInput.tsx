"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/** Hover preview + click-to-set 1-5 star rating picker. */
export default function StarRatingInput({
  value,
  onChange,
  size = 26,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHovered(null)}
      role="group"
      aria-label="Star rating picker"
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(starValue)}
            onMouseEnter={() => setHovered(starValue)}
            aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--green-800) rounded"
          >
            <Star
              size={size}
              fill={i < display ? "#f59e0b" : "none"}
              className={`transition-colors ${
                i < display
                  ? "text-amber-400"
                  : "text-(--neutral-300) hover:text-amber-300"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
