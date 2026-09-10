export type PeriodChange = { pct: number; change: string; changeType: "increase" | "decrease" | "neutral" };

/**
 * Real period-over-period % change for a stats card, replacing hardcoded
 * literals. `pct` is the raw signed number (for components like
 * ProgressMetricCard/StatsWidget that format it themselves); `change` is a
 * pre-formatted "+12%" string (for components like StatsCard that just
 * render whatever string they're given).
 */
export function getPeriodChange(current: number, previous: number): PeriodChange {
  const pct = previous === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - previous) / previous) * 1000) / 10;
  const changeType = pct > 0 ? "increase" : pct < 0 ? "decrease" : "neutral";
  return { pct, change: `${pct > 0 ? "+" : ""}${pct}%`, changeType };
}

/** [startOfCurrentPeriod, startOfPreviousPeriod, endOfPreviousPeriod) for a trailing N-day window. */
export function trailingPeriods(days: number, now = new Date()) {
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);
  return { currentStart, previousStart, previousEnd: currentStart };
}
