'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Spinner } from '@/components/ui/spinner';

interface SignupLoaderProps {
  onDone: () => void;
}

const MESSAGES = [
  'Just a sec…',
  'Almost there…',
  'Adding you to the community…',
  'Welcome to Fechi Organics! 🌿',
] as const;

export function SignupLoader({ onDone }: SignupLoaderProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [showSpinner, setShowSpinner] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setMessageIndex(1), 1200);
    const t2 = setTimeout(() => setMessageIndex(2), 2400);
    const t3 = setTimeout(() => {
      setMessageIndex(3);
      setShowSpinner(false);

      // Fire confetti with brand colours
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#27731e', '#fec700', '#a4f690'],
        });
      });
    }, 3600);

    const t4 = setTimeout(() => onDone(), 4200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 bg-white rounded-3xl px-10 py-12 shadow-2xl max-w-xs w-full mx-4">
        {/* Leaf / brand icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(39,115,30,0.1)' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#27731e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
        </div>

        {/* Spinner (hidden once confetti fires) */}
        {showSpinner && (
          <Spinner
            size={32}
            className="text-[#27731e]"
            style={{ color: '#27731e' }}
          />
        )}

        {/* Animated message crossfade */}
        <div className="relative h-8 w-full flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={messageIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="text-base font-semibold text-center absolute"
              style={{
                fontFamily: 'var(--font-vastago), sans-serif',
                color: '#1a1c1c',
              }}
            >
              {MESSAGES[messageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Brand wordmark */}
        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: 'rgba(64,73,60,0.4)', fontFamily: 'var(--font-stagnan), sans-serif' }}
        >
          Fechi Organics
        </p>
      </div>
    </div>
  );
}
