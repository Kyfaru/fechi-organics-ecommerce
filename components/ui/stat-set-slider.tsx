"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatSetSliderProps {
  /** One grid of stat cards per set. The wrapper/shell stays fixed; only this content transitions. */
  sets: React.ReactNode[];
  index: number;
  onChange: (index: number) => void;
  className?: string;
}

/**
 * Toggles between stat-card "sets" with chevron buttons: the active set fades
 * out to the left, the next set fades in from the right. Mirrors the
 * fade/slide transition used by components/blog/HeroCarousel.tsx.
 */
export function StatSetSlider({ sets, index, onChange, className }: StatSetSliderProps) {
  const canPrev = index > 0;
  const canNext = index < sets.length - 1;

  return (
    <div className={cn("relative", className)}>
      <div className="mb-3 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => canPrev && onChange(index - 1)}
          disabled={!canPrev}
          aria-label="Previous stats"
          className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-dark-border dark:hover:bg-dark-surface"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => canNext && onChange(index + 1)}
          disabled={!canNext}
          aria-label="Next stats"
          className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-dark-border dark:hover:bg-dark-surface"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {sets[index]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
