'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';

interface CriticalToastProps {
  id: string | number;
  title: string;
  message?: string;
  actionUrl?: string;
  duration: number;
}

/**
 * The one deliberate exception to sonner's default styling — white
 * background, black text, red warning icon, and a bottom timer bar, per the
 * notifications design doc's critical-alert spec. Every other toast in the
 * app keeps sonner's defaults (lib/toast.ts).
 */
export function CriticalToast({ id, title, message, actionUrl, duration }: CriticalToastProps) {
  const [shrink, setShrink] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShrink(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative w-full max-w-[380px] overflow-hidden rounded-xl border border-neutral-200 bg-white text-black shadow-lg">
      <div className="flex items-start gap-3 p-4">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="font-dm text-[14px] font-semibold text-black">{title}</p>
          {message && <p className="mt-0.5 text-[13px] text-neutral-600">{message}</p>}
          {actionUrl && (
            <Link
              href={actionUrl}
              onClick={() => sonnerToast.dismiss(id)}
              className="mt-2 inline-block text-[13px] font-semibold text-red-600 hover:underline"
            >
              Details →
            </Link>
          )}
        </div>
        <button
          onClick={() => sonnerToast.dismiss(id)}
          aria-label="Dismiss"
          className="shrink-0 text-neutral-400 hover:text-neutral-600"
        >
          <X size={16} />
        </button>
      </div>
      <div className="h-1 bg-red-100">
        <div
          className="h-full bg-red-600"
          style={{
            width: shrink ? '0%' : '100%',
            transition: shrink ? `width ${duration}ms linear` : undefined,
          }}
        />
      </div>
    </div>
  );
}
