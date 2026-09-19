import { connection } from "next/server";
import countriesData from "world-countries";
import { getRedis } from "@/lib/redis";
import { ok, Err } from "@/lib/api";
import { reportError } from "@/lib/observability";

type Country = { code: string; name: string; flag: string; phoneCode: string; aliases: string[] };

function buildCountries(): Country[] {
  return countriesData
    .map((country) => ({
      code: country.cca2.toUpperCase(),
      name: country.name.common,
      flag: `https://flagcdn.com/w40/${country.cca2.toLowerCase()}.png`,
      // Search-only alternates ("Turkey" for Türkiye, "UK", "Swaziland"…) — the dropdown matches these too.
      aliases: [...new Set([country.name.official, ...country.altSpellings])].filter((a) => a !== country.name.common),
      phoneCode: (country as any).callingCodes?.[0] ?? (country as any).idd?.root
        ? `${(country as any).idd?.root}${(country as any).idd?.suffixes?.[0] ?? ""}`
        : "",
    }))
    .sort((a, b) => {
      if (a.code === "KE") return -1;
      if (b.code === "KE") return 1;
      return a.name.localeCompare(b.name);
    });
}

export async function GET() {
  await connection();
  try {
    const redis = getRedis();
    const cacheKey = "countries:all";

    const cached = await redis.get(cacheKey);
    if (
      Array.isArray(cached) &&
      // entries cached before `aliases` existed fail this check and get rebuilt
      cached.every((country) => typeof country?.flag === "string" && country.flag.startsWith("https://flagcdn.com/") && Array.isArray(country.aliases))
    ) {
      return ok({ countries: cached as Country[] });
    }

    const countries = buildCountries();
    console.log(`[countries] cache miss — rebuilt ${countries.length} countries`);
    await redis.set(cacheKey, countries, { ex: 86400 });
    return ok({ countries });
  } catch (e) {
    reportError(e, { route: "GET /api/countries" });
    console.error("[countries] GET error", e);
    return Err.internal();
  }
}
