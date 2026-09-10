"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface IllustrationProps {
  className?: string;
  size?: number;
}

// Simple leaf silhouette, drawn on a 24x24 grid so it can be scaled/rotated
// consistently across all illustrations below.
const LEAF_PATH = "M12 3C7 3 3 7 3 12c0 5 4 9 9 9 0-6 2-11 7-14-2-2-4-4-7-4Z";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}

export function Botanical404({ className, size = 320 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className={cn("fo-ill-404 h-auto w-full", className)}
    >
      <style>{`
        .fo-ill-404 .leaf {
          transform-box: fill-box;
          transform-origin: center;
          animation-name: fo404Drift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .fo-ill-404 .leaf-a { animation-duration: 6s; animation-delay: 0s; }
        .fo-ill-404 .leaf-b { animation-duration: 7s; animation-delay: 0.6s; }
        .fo-ill-404 .leaf-c { animation-duration: 5.5s; animation-delay: 1.2s; }
        .fo-ill-404 .leaf-d { animation-duration: 6.5s; animation-delay: 1.8s; }
        @keyframes fo404Drift {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-14px) rotate(6deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fo-ill-404 .leaf { animation: none !important; }
        }
      `}</style>
      <circle cx="200" cy="200" r="150" fill="var(--color-mint-light)" opacity="0.5" />
      <g className="leaf leaf-a" transform="translate(140 150) rotate(-15) scale(1.6)">
        <path d={LEAF_PATH} fill="var(--color-primary-green)" />
      </g>
      <g className="leaf leaf-b" transform="translate(245 130) rotate(20) scale(1.1)">
        <path d={LEAF_PATH} fill="var(--color-mint)" />
      </g>
      <g className="leaf leaf-c" transform="translate(180 255) rotate(-40) scale(1.3)">
        <path d={LEAF_PATH} fill="var(--color-dark-green)" />
      </g>
      <g className="leaf leaf-d" transform="translate(265 260) rotate(50) scale(0.9)">
        <path d={LEAF_PATH} fill="var(--color-yellow-cta)" opacity="0.85" />
      </g>
    </svg>
  );
}

export function WiltedBottle500({ className, size = 320 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className={cn("fo-ill-500 h-auto w-full", className)}
    >
      <style>{`
        .fo-ill-500 .crack-dot {
          transform-box: fill-box;
          transform-origin: center;
          animation: fo500Pulse 1.8s ease-in-out infinite;
        }
        .fo-ill-500 .wilt-leaf {
          transform-box: fill-box;
          transform-origin: top center;
          animation: fo500Wilt 5s ease-in-out infinite;
        }
        @keyframes fo500Pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @keyframes fo500Wilt {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(4deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fo-ill-500 .crack-dot,
          .fo-ill-500 .wilt-leaf { animation: none !important; }
        }
      `}</style>
      <ellipse cx="200" cy="330" rx="90" ry="14" fill="var(--danger-bg)" />
      <rect x="150" y="140" width="100" height="170" rx="22" fill="var(--color-mint-light)" stroke="var(--color-primary-green)" strokeWidth="3" />
      <rect x="180" y="100" width="40" height="45" rx="8" fill="var(--color-primary-green)" />
      <rect x="192" y="80" width="16" height="26" rx="6" fill="var(--color-dark-green)" />
      <path d="M170 190 L195 220 L180 240 L205 270" fill="none" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="crack-dot" cx="205" cy="270" r="5" fill="var(--danger)" />
      <g className="wilt-leaf" transform="translate(200 96)">
        <path d={LEAF_PATH} fill="var(--color-mint)" transform="scale(0.8) rotate(160)" />
      </g>
    </svg>
  );
}

export function LockedGate403({ className, size = 320 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className={cn("fo-ill-403 h-auto w-full", className)}
    >
      <style>{`
        .fo-ill-403 .vine {
          stroke-dasharray: 520;
          stroke-dashoffset: 520;
          animation: fo403Draw 2.4s ease-out forwards;
        }
        .fo-ill-403 .lock {
          transform-box: fill-box;
          transform-origin: center;
          animation: fo403Float 4s ease-in-out infinite;
          animation-delay: 2.4s;
        }
        @keyframes fo403Draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fo403Float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fo-ill-403 .vine { stroke-dashoffset: 0; animation: none !important; }
          .fo-ill-403 .lock { animation: none !important; }
        }
      `}</style>
      <path
        className="vine"
        d="M90 320 C90 200 120 110 200 90 C280 110 310 200 310 320"
        fill="none"
        stroke="var(--color-primary-green)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <g className="lock" transform="translate(200 230)">
        <rect x="-32" y="-4" width="64" height="52" rx="10" fill="var(--color-dark-green)" />
        <path d="M-18 -4 v-18 a18 18 0 0 1 36 0 v18" fill="none" stroke="var(--color-dark-green)" strokeWidth="8" />
        <circle cx="0" cy="20" r="7" fill="var(--color-yellow-cta)" />
      </g>
    </svg>
  );
}

export function BloomingClockTimeout408({ className, size = 320 }: IllustrationProps) {
  const reducedMotion = useReducedMotion();

  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className={cn("fo-ill-408 h-auto w-full", className)}
    >
      <style>{`
        .fo-ill-408 .petal {
          transform-box: fill-box;
          transform-origin: center;
          animation: fo408Breathe 3.6s ease-in-out infinite;
        }
        .fo-ill-408 .petal:nth-child(2) { animation-delay: 0.3s; }
        .fo-ill-408 .petal:nth-child(3) { animation-delay: 0.6s; }
        .fo-ill-408 .petal:nth-child(4) { animation-delay: 0.9s; }
        .fo-ill-408 .petal:nth-child(5) { animation-delay: 1.2s; }
        .fo-ill-408 .petal:nth-child(6) { animation-delay: 1.5s; }
        @keyframes fo408Breathe {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fo-ill-408 .petal { animation: none !important; }
        }
      `}</style>
      <g transform="translate(200 200)">
        {Array.from({ length: 6 }).map((_, i) => (
          <ellipse
            key={i}
            className="petal"
            cx="0"
            cy="-90"
            rx="26"
            ry="46"
            fill="var(--color-mint)"
            opacity="0.85"
            transform={`rotate(${i * 60})`}
          />
        ))}
        <circle r="62" fill="white" stroke="var(--color-primary-green)" strokeWidth="4" />
        {/* Hour hand — SMIL rotation is disabled entirely (not just paused) when reduced motion is preferred */}
        <line x1="0" y1="0" x2="0" y2="-36" stroke="var(--color-dark-green)" strokeWidth="5" strokeLinecap="round">
          {!reducedMotion && (
            <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="9s" repeatCount="indefinite" />
          )}
        </line>
        {/* Minute hand */}
        <line x1="0" y1="0" x2="26" y2="0" stroke="var(--color-yellow-cta)" strokeWidth="5" strokeLinecap="round">
          {!reducedMotion && (
            <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="18s" repeatCount="indefinite" />
          )}
        </line>
        <circle r="6" fill="var(--color-dark-green)" />
      </g>
    </svg>
  );
}

export function DisconnectedVineNetwork({ className, size = 320 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className={cn("fo-ill-network h-auto w-full", className)}
    >
      <style>{`
        .fo-ill-network .badge {
          transform-box: fill-box;
          transform-origin: center;
          animation: foNetBreathe 4s ease-in-out infinite;
        }
        .fo-ill-network .spark {
          transform-box: fill-box;
          transform-origin: center;
          animation: foNetSpark 2.4s ease-in-out infinite;
        }
        @keyframes foNetBreathe {
          0%, 100% { transform: translateY(0); opacity: 0.9; }
          50% { transform: translateY(-10px); opacity: 1; }
        }
        @keyframes foNetSpark {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fo-ill-network .badge,
          .fo-ill-network .spark { animation: none !important; }
        }
      `}</style>
      <g className="badge">
        <circle cx="200" cy="200" r="120" fill="var(--color-mint-light)" stroke="var(--color-primary-green)" strokeWidth="4" />
        <path d="M140 200 C160 180 175 180 185 195" fill="none" stroke="var(--color-primary-green)" strokeWidth="6" strokeLinecap="round" />
        <path d="M260 200 C240 220 225 220 215 205" fill="none" stroke="var(--color-primary-green)" strokeWidth="6" strokeLinecap="round" />
        <circle className="spark" cx="200" cy="200" r="6" fill="var(--danger)" />
      </g>
    </svg>
  );
}

export function SproutingSeedComingSoon({ className, size = 320 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className={cn("fo-ill-seed h-auto w-full", className)}
    >
      <style>{`
        .fo-ill-seed .sprout-leaf {
          transform-box: fill-box;
          transform-origin: bottom center;
          animation-name: foSeedFloat;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .fo-ill-seed .leaf-1 { animation-duration: 4.5s; animation-delay: 0s; }
        .fo-ill-seed .leaf-2 { animation-duration: 5s; animation-delay: 0.5s; }
        .fo-ill-seed .seed {
          transform-box: fill-box;
          transform-origin: center;
          animation: foSeedRock 3.6s ease-in-out infinite;
        }
        @keyframes foSeedFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(4deg); }
        }
        @keyframes foSeedRock {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fo-ill-seed .sprout-leaf,
          .fo-ill-seed .seed { animation: none !important; }
        }
      `}</style>
      <ellipse className="seed" cx="200" cy="300" rx="26" ry="34" fill="var(--color-dark-green)" />
      <path d="M200 300 C200 250 200 210 200 180" fill="none" stroke="var(--color-primary-green)" strokeWidth="6" strokeLinecap="round" />
      <g className="sprout-leaf leaf-1" transform="translate(200 200)">
        <path d={LEAF_PATH} fill="var(--color-mint)" transform="scale(1.4) rotate(-30)" />
      </g>
      <g className="sprout-leaf leaf-2" transform="translate(200 180)">
        <path d={LEAF_PATH} fill="var(--color-primary-green)" transform="scale(1.2) rotate(40)" />
      </g>
    </svg>
  );
}
