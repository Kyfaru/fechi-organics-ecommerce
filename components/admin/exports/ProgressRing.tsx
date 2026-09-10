"use client";

// Bare SVG progress ring (brand green, no built-in percentage text) — a
// small sibling to components/ui/CircularProgress.tsx, which always renders
// its percentage inside the ring and has no room for the "icon in the
// center" look this feature needs (illegible at header-icon size anyway).
export function ProgressRing({
  percent, size = 36, strokeWidth = 3, children,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
        <circle cx={center} cy={center} r={r} fill="none" stroke="var(--neutral-200)" strokeWidth={strokeWidth} />
        <circle
          cx={center} cy={center} r={r} fill="none"
          stroke="var(--green-700)" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          style={{ transformOrigin: `${center}px ${center}px`, transform: "rotate(-90deg)", transition: "stroke-dashoffset 0.25s ease" }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}
