type Severity = "CRITICAL" | "WARNING" | "INFO";

// Severity colors are the one deliberate exception to the brand palette
// (design doc Section 10) — red/amber/blue are near-universal danger/caution
// /info signals, kept recognizable rather than forced into green/gold.
const SEVERITY_MAP: Record<Severity, { label: string; text: string; bg: string; dot: string }> = {
  CRITICAL: { label: "Critical", text: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-950/40", dot: "bg-red-600" },
  WARNING: { label: "Warning", text: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/40", dot: "bg-amber-500" },
  INFO: { label: "Info", text: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-950/40", dot: "bg-blue-500" },
};

interface SeverityBadgeProps {
  severity: Severity;
  /** Compact form — just the colored dot, for tight rows like the bell preview */
  dotOnly?: boolean;
}

export function SeverityBadge({ severity, dotOnly }: SeverityBadgeProps) {
  const s = SEVERITY_MAP[severity];

  if (dotOnly) {
    return <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${s.dot}`} aria-label={s.label} />;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-[10px] h-6 font-dm text-[12px] font-medium shrink-0 ${s.text} ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
