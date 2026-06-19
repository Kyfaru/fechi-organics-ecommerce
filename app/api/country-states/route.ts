import { NextRequest } from "next/server";
import { connection } from "next/server";
import { getRedis } from "@/lib/redis";
import { ok } from "@/lib/api";

type StateOption = { code: string; name: string };

export async function GET(req: NextRequest) {
  await connection();
  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (!code) return ok({ states: [] as StateOption[], fallback: true });

  const redis = getRedis();
  const cacheKey = `states:${code}`;

  try {
    const cached = await redis.get(cacheKey);
    if (Array.isArray(cached)) return ok({ states: cached as StateOption[], fallback: false });

    const apiKey = process.env.COUNTRY_STATE_CITY_API_KEY;
    if (!apiKey) return ok({ states: [] as StateOption[], fallback: true });

    const res = await fetch(`https://api.countrystatecity.in/v1/countries/${code}/states`, {
      headers: { "X-CSCAPI-KEY": apiKey },
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`CountryStateCity returned ${res.status}`);

    const raw = (await res.json()) as Array<{ iso2?: string; name?: string }>;
    const states = raw
      .map((s) => ({ code: s.iso2 ?? s.name ?? "", name: s.name ?? s.iso2 ?? "" }))
      .filter((s) => s.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    await redis.set(cacheKey, states, { ex: 86400 });
    return ok({ states, fallback: false });
  } catch (e) {
    console.error("[country-states] GET fallback", e);
    return ok({ states: [] as StateOption[], fallback: true });
  }
}
