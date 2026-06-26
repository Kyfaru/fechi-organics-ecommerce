import type { SeriesPoint } from "@/components/ui/metric-chart";

export function toSeriesPoints(
  data: { month?: string; date?: string; amount: number }[]
): SeriesPoint[] {
  return data.map((d) => ({ value: d.amount, date: d.month ?? d.date ?? "" }));
}

export function toOrderSeriesPoints(
  data: { date: string; count: number }[]
): SeriesPoint[] {
  return data.map((d) => ({ value: d.count, date: d.date }));
}

export function toValueSeriesPoints(
  data: { label: string; value: number }[]
): SeriesPoint[] {
  return data.map((d) => ({ value: d.value, date: d.label }));
}
