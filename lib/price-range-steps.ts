// Non-uniform step banding for the export price-range slider (10–100,000
// KES): 5 KES steps in the tens band, 10 KES in the hundreds band, 100 KES
// in the thousands band, 1000 KES in the tens-of-thousands band. Kept as a
// pure function, reasoned about in isolation, since getting the banding
// boundaries right is the actual risk here — not the slider rendering.
export const PRICE_MIN = 10;
export const PRICE_MAX = 100_000;

function stepAt(value: number): number {
  if (value < 100) return 5; // 10–99
  if (value < 1_000) return 10; // 100–999
  if (value < 10_000) return 100; // 1000–9999
  return 1_000; // 10000–100000
}

export function clampPrice(value: number): number {
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, value));
}

export function nextStep(value: number, direction: 1 | -1): number {
  const step = stepAt(direction === 1 ? value : value - 1);
  const next = value + direction * step;
  return clampPrice(Math.round(next / step) * step);
}

// Snaps an arbitrary value (e.g. from a drag gesture computing a raw
// position) down to the nearest valid step boundary for its band.
export function snapToStep(value: number): number {
  const v = clampPrice(value);
  const step = stepAt(v);
  return clampPrice(Math.round(v / step) * step);
}
