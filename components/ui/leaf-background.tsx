"use client";

import { useEffect, useState } from "react";

type Leaf = {
  x: number;
  y: number;
  scale: number;
  rot: number;
  sw: number;
  blur?: 2 | 3 | 4;
  opacity: number;
  delay: number;
  dur: number;
};

const LEAF_D = "M0 0H50C78 0 100 22 100 50H50C22 50 0 28 0 0Z";
const VB_W = 1422;
const VB_H = 800;
const COUNT = 48;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeLeaves(): Leaf[] {
  const blurPool: (2 | 3 | 4 | undefined)[] = [undefined, undefined, undefined, 2, 2, 3, 4];
  return Array.from({ length: COUNT }, () => {
    const x = rand(0, VB_W);
    return {
      x,
      y: rand(0, VB_H),
      scale: rand(0.35, 1.3),
      rot: rand(0, 360),
      sw: rand(1.5, 3.5),
      blur: blurPool[Math.floor(Math.random() * blurPool.length)],
      opacity: rand(0.45, 0.9),
      // stagger roughly left-to-right, plus jitter so it isn't a rigid sweep
      delay: (x / VB_W) * 2.5 + rand(-0.4, 0.4),
      dur: rand(2.4, 4.2),
    };
  });
}

// ponytail: session-scoped — the reveal only plays once per tab session,
// then holds fully visible; sessionStorage (not localStorage) so it replays
// on a fresh tab/session, matching a "first landing" entrance effect.
const INTRO_PLAYED_KEY = "fo_leaf_intro_played";

export function LeafBackground() {
  const [leaves, setLeaves] = useState<Leaf[] | null>(null);
  const [playIntro, setPlayIntro] = useState(false);

  // ponytail: random per leaf must be client-only or SSR/CSR markup mismatches
  useEffect(() => {
    setLeaves(makeLeaves());
    if (!sessionStorage.getItem(INTRO_PLAYED_KEY)) {
      setPlayIntro(true);
      sessionStorage.setItem(INTRO_PLAYED_KEY, "1");
    }
  }, []);

  return (
    <div className={`leaf-bg-wrap${playIntro ? " leaf-bg-intro" : ""}`}>
      <style>{`
        /* --grow must be registered so the browser can smoothly interpolate
           it inside the mask-image gradient below — without this, an
           unregistered custom property flips discretely mid-keyframe
           instead of easing, which read as the leaves abruptly popping
           in/out rather than growing in. */
        @property --grow {
          syntax: '<percentage>';
          inherits: false;
          initial-value: 100%;
        }

        .leaf-bg-wrap {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 0;
          pointer-events: none;
        }

        .leaf-bg-wrap svg {
          width: 100%;
          height: 100%;
          display: block;
          -webkit-mask-image: linear-gradient(
            to right,
            black 0%,
            black var(--grow, 100%),
            transparent var(--grow, 100%)
          );
          mask-image: linear-gradient(
            to right,
            black 0%,
            black var(--grow, 100%),
            transparent var(--grow, 100%)
          );
        }

        /* Only the first landing per session plays the reveal; it grows in
           once and holds (fill-mode forwards) — it never wipes back out. */
        .leaf-bg-wrap.leaf-bg-intro svg {
          animation: leafGrow 1.8s ease-out forwards;
        }

        @keyframes leafGrow {
          0%   { --grow: 0%; }
          100% { --grow: 100%; }
        }

        .leaf-bg-wrap path {
          transform-box: fill-box;
          transform-origin: center;
          animation-name: leafMorph;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }

        @keyframes leafMorph {
          0%   { fill-opacity: 0;    stroke-opacity: 0.9; stroke-width: var(--sw); }
          50%  { fill-opacity: 0.9;  stroke-opacity: 0;   stroke-width: 0; }
          100% { fill-opacity: 0;    stroke-opacity: 0.9; stroke-width: var(--sw); }
        }

        @media (prefers-reduced-motion: reduce) {
          .leaf-bg-wrap svg,
          .leaf-bg-wrap path {
            animation: none !important;
          }
        }

        @media (max-width: 640px) {
          .leaf-bg-wrap.leaf-bg-intro svg {
            animation-duration: 1.2s;
          }
          /* thin out the field on small screens */
          .leaf-bg-wrap path:nth-child(2n) {
            display: none;
          }
        }
      `}</style>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="llleaves-blur-2" x="-100%" y="-100%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2"></feGaussianBlur>
          </filter>
          <filter id="llleaves-blur-3" x="-100%" y="-100%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4"></feGaussianBlur>
          </filter>
          <filter id="llleaves-blur-4" x="-100%" y="-100%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12"></feGaussianBlur>
          </filter>
        </defs>
        {leaves?.map((leaf, i) => (
          <path
            key={i}
            d={LEAF_D}
            fill="hsl(113, 48%, 46%)"
            stroke="hsl(113, 48%, 46%)"
            transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rot}) scale(${leaf.scale})`}
            filter={leaf.blur ? `url(#llleaves-blur-${leaf.blur})` : undefined}
            opacity={leaf.opacity}
            style={
              {
                "--sw": leaf.sw,
                animationDelay: `${leaf.delay}s`,
                animationDuration: `${leaf.dur}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </svg>
    </div>
  );
}
