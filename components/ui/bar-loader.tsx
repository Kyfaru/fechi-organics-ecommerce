'use client';

import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BarLoaderProps {
  progress: number;
  label?: string;
  variant?: 'default' | 'success' | 'error';
  className?: string;
}

export function BarLoader({ progress, label, variant = 'default', className }: BarLoaderProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const isDone = clamped >= 100;
  const isError = variant === 'error';

  const fillColor = isError
    ? '#ef4444'
    : isDone || variant === 'success'
    ? '#27731e'
    : '#27731e';

  return (
    <div className={cn('w-full flex flex-col gap-1.5', className)}>
      {/* Label row */}
      {label && (
        <div className="flex items-center justify-between text-xs text-[#40493c]">
          <span>{label}</span>
        </div>
      )}

      {/* Track + fill */}
      <div className="relative w-full h-2.5 bg-[#e8fce3] rounded-full overflow-hidden">
        <motion.div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ backgroundColor: fillColor }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Percentage / done indicator */}
      <div className="flex items-center justify-end gap-1.5">
        {isDone && !isError ? (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#27731e' }}>
            <CheckCircle className="h-3.5 w-3.5" />
            Complete
          </span>
        ) : (
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              isError ? 'text-red-500' : 'text-[#40493c]',
            )}
          >
            {Math.round(clamped)}%
          </span>
        )}
      </div>
    </div>
  );
}
