import { connection } from "next/server";
import countriesData from "world-countries";
import { getRedis } from "@/lib/redis";
import { ok } from "@/lib/api";

type Country = { code: string; name: string; flag: string };

function buildCountries(): Country[] {
  return countriesData
    .map((country) => ({
      code: country.cca2.toUpperCase(),
      name: country.name.common,
      flag: `https://flagcdn.com/w40/${country.cca2.toLowerCase()}.png`,
    }))
    .sort((a, b) => {
      if (a.code === "KE") return -1;
      if (b.code === "KE") return 1;
      return a.name.localeCompare(b.name);
    });
}

export async function GET() {
  await connection();
  const redis = getRedis();
  const cacheKey = "countries:all";

  const cached = await redis.get(cacheKey);
  if (
    Array.isArray(cached) &&
    cached.every((country) => typeof country?.flag === "string" && country.flag.startsWith("https://flagcdn.com/"))
  ) {
    return ok({ countries: cached as Country[] });
  }

  const countries = buildCountries();
  await redis.set(cacheKey, countries, { ex: 86400 });
  return ok({ countries });
}
