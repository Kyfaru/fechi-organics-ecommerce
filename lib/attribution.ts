import type { NextRequest } from "next/server";

export const UTM_COOKIE_NAME = "fechi_utm";

export type UtmSource = "facebook" | "instagram" | "google" | "tiktok" | "other";
export const TRACKED_UTM_SOURCES: UtmSource[] = ["facebook", "instagram", "google", "tiktok", "other"];

export function normalizeUtmSource(raw: string | null | undefined): UtmSource {
  if (!raw) return "other";
  const v = raw.toLowerCase();
  if (v.includes("facebook") || v === "fb") return "facebook";
  if (v.includes("instagram") || v === "ig") return "instagram";
  if (v.includes("tiktok")) return "tiktok";
  if (v.includes("google") || v.includes("adwords") || v.includes("gads")) return "google";
  return "other";
}

export type StoredUtm = { source: UtmSource; medium: string | null; campaign: string | null };

/** Reads the last-touch UTM attribution cookie set by PostHogProvider on landing. */
export function readUtmCookie(req: NextRequest): StoredUtm | null {
  const raw = req.cookies.get(UTM_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { s?: string; m?: string; c?: string };
    if (!parsed.s) return null;
    return { source: normalizeUtmSource(parsed.s), medium: parsed.m ?? null, campaign: parsed.c ?? null };
  } catch {
    return null;
  }
}
