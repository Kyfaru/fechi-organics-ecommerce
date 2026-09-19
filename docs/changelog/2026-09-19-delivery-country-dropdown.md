# 2026-09-19 — Delivery page: countries "missing" from the dropdown + staging build break

Branch: `staging`. Code change landed in `bc3bffb` ("feat: enhance Country type with aliases and improve country fetching logic"). Not confirmed deployed: the Vercel build of `bc3bffb` **failed** (see §3); the fix for that is in the working tree and uncommitted at time of writing.

Factual record plus prevention rules. The rules in §5 exist so this class of bug is not reintroduced.

## 1. Symptom

On `/delivery` the Country dropdown showed countries, but searching for some returned nothing — e.g. "Turkey", "Sychelles".

## 2. Root cause

The list itself was complete. `/api/countries` builds 250 entries from `world-countries`, and the Redis key `countries:all` held the same 250 (checked against a fresh build: 0 missing). The dropdown (`SelectDropdown` in `components/checkout/DeliveryClient.tsx`) renders every option it receives. Nothing was being dropped.

**The search was the problem.** It was `label.toLowerCase().includes(query)` against one English name per country:

- **Turkey** is stored as `Türkiye` (`name.common` in `world-countries` v5). `"türkiye".includes("turkey")` is false. The same trap applies to `Czechia` (Czech Republic), `Eswatini` (Swaziland), `Myanmar` (Burma), `United States` (USA), `United Kingdom` (UK).
- **Seychelles** was present as `Seychelles`. The query `sychelles` is a misspelling, so a substring match cannot find it.

### Latent defect found while investigating (not confirmed as what was seen)

`DeliveryClient` fetched countries with `fetch("/api/countries").then(r => r.json())`, with no `r.ok` check, and the app persists React Query to `localStorage` (`app/providers.tsx`: `PersistQueryClientProvider`, key `fechi-cache`, 24h `maxAge`, `refetchOnMount: false`). Consequences:

1. A 500/429 JSON body resolves the promise, so React Query records it as **success** and persists it.
2. `countriesQuery.data?.data?.countries` is then `undefined`, and the component falls back to a hardcoded **Kenya-only** list.
3. That browser stays on Kenya-only for up to 24h. Other browsers look fine, so it is hard to reproduce.

The user confirmed the symptom was the search (§1), not a Kenya-only list, so this was not the observed bug. It was fixed at the same time because it produces the same headline ("not all countries") and is silent.

## 3. Second incident in the same commit: staging build broke

`bc3bffb` also contained a stray word on line 1 of `app/api/countries/states/route.ts`:

```
-import { assertTrustedOrigin } from "@/lib/origin-check";
+nowimport { assertTrustedOrigin } from "@/lib/origin-check";
```

Vercel build for `bc3bffb` failed: `./app/api/countries/states/route.ts:1:11 — Expected ';', '}' or <eof>` (Turbopack, 18:55 build log). This file was not part of the country-search change; the typo was saved into the file while it was open in the editor and swept into the commit. Fixed by removing `now` (working tree, uncommitted). `pnpm exec tsc --noEmit` over the whole project now reports zero errors.

## 4. What changed

| File | Change |
|---|---|
| `app/api/countries/route.ts` | Each country now includes `aliases` (official name + `altSpellings`, minus the common name). The cache-validity check also requires `Array.isArray(country.aliases)`, so entries cached in the old shape are rebuilt instead of served for up to 24h. Logs `[countries] cache miss — rebuilt N countries`. Payload ≈ 39 KB uncompressed. |
| `components/checkout/DeliveryClient.tsx` | `queryFn` for `["countries"]` now throws on `!res.ok` / `!json.ok` / missing `countries`, logging `console.error("[delivery] GET /api/countries failed", { status, body })`; logs the count on success. Search folds accents/case and matches label **and** aliases. If nothing matches, falls back to an in-order-letters (subsequence) match so dropped-letter typos work (`sychelles` → Seychelles). |
| `app/api/countries/states/route.ts` | Removed the stray `now` (§3). |

Search checks run against the real dataset: `turkey`, `turkiye` → Türkiye; `sychelles` → Seychelles; `usa` → United States; `czech republic` → Czechia; `swaziland` → Eswatini; `burma` → Myanmar; `cote d'ivoire` → Ivory Coast; nonsense → no results.

**Not verified:** behaviour in a real browser (dev server was not running), and the Vercel rebuild after the `states/route.ts` fix.
**Known limits:** typo tolerance covers dropped letters only (a transposed or wrong letter, e.g. `Seychelless`, still won't match); `uk` also lists loose matches (Cook Islands, Ukraine) alongside United Kingdom; browsers with the old list already in `localStorage` keep it up to 24h unless `fechi-cache` is cleared.

## 5. Prevention rules

1. **Every `useQuery` `queryFn` must throw on a non-OK response.** The persisted cache stores anything that resolves as a success, for 24h, and `refetchOnMount` is globally off. Reference implementation: the `["countries"]` query in `DeliveryClient.tsx`.
2. **Never silently fall back to a hardcoded partial list.** If a fallback is unavoidable, `console.error` when it triggers.
3. **Searchable reference data (countries, cities, currencies) must match alternate names.** Test with Türkiye/Turkey, Czechia, Eswatini, Côte d'Ivoire before calling a picker done.
4. **When the shape of a Redis-cached payload changes, make the cache-validity check require the new field** (as done with `aliases`). Otherwise the old shape is served until the TTL expires.
5. **Before pushing, run `pnpm exec tsc --noEmit` unfiltered and read `git diff --stat`.** A one-word typo in a file unrelated to the change broke the staging build; a filtered typecheck (only the files being edited) would not have caught it.

## 6. Remaining exposure

The unchecked `fetch(...).then(r => r.json())` `queryFn` pattern (defect in §2) is still present in **41 files** (single-line form only; multi-line variants not counted), including `Navbar.tsx`, `CartClient.tsx`, `ProductCard.tsx`, `ProductDetailClient.tsx`, the `Admin*Client.tsx` set, and the other three queries in `DeliveryClient.tsx` (delivery zones, states, pricing). Each can cache an error body as success. No incident has been traced to them; the durable fix is a shared `fetchJson` helper that throws on `!res.ok`, adopted incrementally. Not done here.
