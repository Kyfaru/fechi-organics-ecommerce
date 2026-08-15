/** Shared time-series bucketing helpers for admin stats/analytics routes. */

export type Granularity = "hourly" | "daily" | "weekly" | "monthly";

export function hourKey(d: Date): string {
  // "2026-06-21T14:00"
  return d.toISOString().slice(0, 13) + ":00";
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekKey(d: Date): string {
  // ISO week: find the Monday of the week
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getUTCDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function bucketKey(d: Date, granularity: Granularity): string {
  switch (granularity) {
    case "hourly": return hourKey(d);
    case "daily": return dayKey(d);
    case "weekly": return weekKey(d);
    case "monthly": return monthKey(d);
  }
}

/** Generate the ordered list of bucket labels between gte and lte (inclusive). */
export function generateBuckets(gte: Date | null, lte: Date, granularity: Granularity): string[] {
  const start = gte ?? new Date(0);
  const buckets: string[] = [];
  const seen = new Set<string>();

  const cursor = new Date(start);

  while (cursor <= lte) {
    const key = bucketKey(cursor, granularity);
    if (!seen.has(key)) {
      seen.add(key);
      buckets.push(key);
    }
    switch (granularity) {
      case "hourly": cursor.setHours(cursor.getHours() + 1); break;
      case "daily": cursor.setDate(cursor.getDate() + 1); break;
      case "weekly": cursor.setDate(cursor.getDate() + 7); break;
      case "monthly": cursor.setMonth(cursor.getMonth() + 1); break;
    }
  }

  const lastKey = bucketKey(lte, granularity);
  if (!seen.has(lastKey)) {
    buckets.push(lastKey);
  }

  return buckets;
}
