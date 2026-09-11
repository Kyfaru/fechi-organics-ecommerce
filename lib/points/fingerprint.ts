/**
 * A cheap, stable-ish browser fingerprint.
 *
 * ponytail: hand-rolled, ~40 lines, no dependency. FingerprintJS would be more
 * evasion-resistant, but the signal that actually carries the anti-farming
 * decision is the payment instrument (an M-Pesa MSISDN or a Paystack card
 * fingerprint) — see lib/points/anti-abuse.ts, where DEVICE is weighted 40 and
 * a payment match is 100. This exists to catch the lazy case of one person
 * opening several accounts in one browser, not a determined attacker.
 *
 * Deliberately excludes anything that changes between sessions (window size,
 * connection type) so the same browser keeps producing the same value.
 * The raw string never leaves the browser as-is — the server HMACs it before
 * storing, so no identifying detail is retained.
 */

const FINGERPRINT_STORAGE_KEY = "fechi_device";

/** Collects stable browser traits. Returns null outside the browser. */
export function collectDeviceSignal(): string | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;

  const parts: string[] = [
    navigator.userAgent ?? "",
    navigator.language ?? "",
    (navigator.languages ?? []).join(","),
    String(navigator.hardwareConcurrency ?? ""),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? ""),
    String(navigator.maxTouchPoints ?? ""),
    // Screen geometry, not window geometry — a resized window must not look
    // like a different device.
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    String(new Date().getTimezoneOffset()),
  ];

  parts.push(canvasSignature());

  return parts.join("|");
}

/**
 * A short canvas render signature. Font rasterisation and anti-aliasing differ
 * by GPU/driver/OS, which separates two accounts on genuinely different
 * machines that share a user agent.
 */
function canvasSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Fechi Organics \u{1F33F}", 2, 2);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Fechi Organics \u{1F33F}", 4, 6);

    // Only a slice — the full data URL is large and the prefix is stable enough.
    return canvas.toDataURL().slice(-80);
  } catch {
    return "canvas-error";
  }
}

/**
 * Returns a per-browser random id, persisted in localStorage. Complements the
 * trait fingerprint: clearing storage defeats this one, changing hardware
 * defeats the other, and defeating both at once is the point.
 */
export function getOrCreateDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(FINGERPRINT_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(FINGERPRINT_STORAGE_KEY, id);
    return id;
  } catch {
    // Private mode / storage disabled — the trait fingerprint still applies.
    return null;
  }
}

/** Both signals, ready to POST to /api/points/device. */
export function collectDeviceSignals(): { fingerprint: string | null; deviceId: string | null } {
  return { fingerprint: collectDeviceSignal(), deviceId: getOrCreateDeviceId() };
}
