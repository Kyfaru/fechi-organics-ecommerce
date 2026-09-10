"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";

/* ─── Types matching the API response shapes ─────────────────────
   GET /api/delivery-zones -> { ok, data: { zones: Zone[] } }
   POST /api/delivery-pricing -> { ok, data: PricingInfo }
──────────────────────────────────────────────────────────────── */
type Zone = {
  id: string;
  name: string;
  county: string;
  deliveryFeeKes: number;
  branchId: string | null;
};

type PricingInfo = {
  feeKes: number;
  currency: "KES";
  label: string;
};

const ALL_ZONES = "ALL";

/* ─── Hand-drawn delivery illustration (brand colors, no external assets) ─── */
function DeliveryIllustration() {
  return (
    <svg viewBox="0 0 420 420" className="w-full max-w-[420px] mx-auto" aria-hidden>
      <circle cx="210" cy="210" r="200" fill="#e8fce3" className="dark:fill-green-900/20" />
      <circle
        cx="210" cy="210" r="152" fill="none" stroke="#a4f690" strokeWidth="2"
        strokeDasharray="6 10" className="dark:stroke-green-700/60"
      />

      {/* dashed delivery route */}
      <path
        d="M78 292 Q150 214 214 254 T348 132"
        fill="none" stroke="#27731e" strokeWidth="4" strokeDasharray="2 14" strokeLinecap="round"
        className="dark:stroke-green-400"
      />

      {/* origin pin (branch/store) */}
      <g transform="translate(78 254)">
        <path
          d="M0 0c-16.5 0-30 13.4-30 30 0 22.5 30 54 30 54s30-31.5 30-54c0-16.6-13.5-30-30-30z"
          fill="#27731e" className="dark:fill-green-500"
        />
        <circle cx="0" cy="30" r="11.5" fill="white" />
        <path d="M-5 30l3.5 3.5L7 24" stroke="#27731e" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* destination package */}
      <g transform="translate(340 108)">
        <rect x="-32" y="-24" width="64" height="50" rx="8" fill="#fec700" />
        <path d="M-32 -8h64" stroke="#1a1c1c" strokeWidth="3" />
        <path d="M0 -24v50" stroke="#1a1c1c" strokeWidth="3" />
      </g>

      {/* delivery van */}
      <g transform="translate(196 236)">
        <rect
          x="-32" y="-15" width="64" height="30" rx="6"
          fill="white" stroke="#27731e" strokeWidth="3"
          className="dark:fill-gray-800 dark:stroke-green-400"
        />
        <rect x="13" y="-15" width="19" height="30" rx="4" fill="#a4f690" className="dark:fill-green-700" />
        <circle cx="-15" cy="17" r="7.5" fill="#1a1c1c" className="dark:fill-white" />
        <circle cx="17" cy="17" r="7.5" fill="#1a1c1c" className="dark:fill-white" />
      </g>
    </svg>
  );
}

/* ─── Zone card ──────────────────────────────────────────────── */
function ZoneCard({ zone, delay }: { zone: Zone; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay }}
      className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-[#e8fce3] dark:border-gray-800 shadow-sm hover:shadow-md hover:border-[#27731e]/30 dark:hover:border-green-700/50 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-base truncate">{zone.name}</h3>
          <p className="font-body text-[#40493c] dark:text-gray-400 text-xs mt-1">{zone.county} County</p>
        </div>
        <span className="font-heading font-semibold text-[#27731e] dark:text-green-400 text-sm whitespace-nowrap flex-shrink-0">
          KES {(zone.deliveryFeeKes / 100).toLocaleString("en-KE")}
        </span>
      </div>
    </motion.div>
  );
}

export function ShippingClient() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCounty, setSelectedCounty] = useState(ALL_ZONES);

  // Reused from the checkout pricing logic so the numbers on this page never
  // drift out of sync with what customers are actually charged.
  const [pickupInfo, setPickupInfo] = useState<PricingInfo | null>(null);
  const [fallbackInfo, setFallbackInfo] = useState<PricingInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // No `county` param -> all active zones nationwide (route made county-optional for this page)
        const res = await fetch("/api/delivery-zones");
        const json = await res.json();
        if (cancelled) return;
        if (json.ok) {
          setZones(json.data.zones ?? []);
        } else {
          setError(json.error?.message ?? "Couldn't load delivery zones.");
        }
      } catch (e) {
        console.error("[ShippingClient] failed to load delivery zones", e);
        if (!cancelled) setError("Network error while loading delivery zones. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pickupRes, fallbackRes] = await Promise.all([
          fetch("/api/delivery-pricing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ country: "KE", deliveryType: "PICKUP" }),
          }),
          fetch("/api/delivery-pricing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ country: "KE", deliveryType: "DELIVERY" }),
          }),
        ]);
        const [pickupJson, fallbackJson] = await Promise.all([pickupRes.json(), fallbackRes.json()]);
        if (cancelled) return;
        if (pickupJson.ok) setPickupInfo(pickupJson.data);
        if (fallbackJson.ok) setFallbackInfo(fallbackJson.data);
      } catch (e) {
        // Non-critical — the info cards simply won't render if this fails.
        console.error("[ShippingClient] failed to load pricing info", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counties = Array.from(new Set(zones.map((z) => z.county))).sort();
  const visibleZones = selectedCounty === ALL_ZONES ? zones : zones.filter((z) => z.county === selectedCounty);

  // Grouped by county for the "All Zones" view so the grid reads as a directory, not a flat dump.
  const groupedByCounty =
    selectedCounty === ALL_ZONES
      ? counties.map((county) => ({ county, zones: zones.filter((z) => z.county === county) }))
      : [{ county: selectedCounty, zones: visibleZones }];

  return (
    <>
      {/* ══════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════ */}
      <section className="px-4 md:px-8 pt-14 pb-16 md:pt-20 md:pb-24 bg-white dark:bg-gray-950 transition-colors overflow-hidden">
        <div className="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-10 md:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="font-body text-[#27731e] dark:text-green-400 text-[12px] md:text-[13px] tracking-[1.5px] uppercase mb-3 font-semibold">
              Delivery &amp; Shipping
            </p>
            <h1 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[36px] md:text-[52px] tracking-[-1px] leading-tight mb-5">
              Wherever you are,<br />we&apos;ll get it to you.
            </h1>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-[15px] md:text-[16px] leading-relaxed max-w-md mb-8">
              We deliver across Kenya through a growing network of local zones, with free
              pickup at any FECHI Organics branch. Check the zones below to see delivery
              fees for your area.
            </p>
            <a
              href="#zones"
              className="inline-flex items-center gap-2 bg-[#27731e] text-white font-body font-semibold px-8 py-4 rounded-full hover:bg-[#045a03] transition-colors text-base w-fit"
            >
              View Delivery Zones
              <Icon icon="mdi:arrow-down" width={18} />
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <DeliveryIllustration />
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          REQUEST A NEW ZONE CTA
      ══════════════════════════════════════════════════════ */}
      <section className="px-4 md:px-8 pb-16 bg-white dark:bg-gray-950 transition-colors">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="bg-[#27731e] rounded-[24px] p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
          >
            <div>
              <p className="font-body text-[#a4f690] text-xs font-semibold tracking-widest uppercase mb-3">
                Don&apos;t see your area?
              </p>
              <h2 className="font-heading text-white font-semibold text-2xl md:text-3xl mb-2">
                Request a New Delivery Zone
              </h2>
              <p className="font-body text-white/70 text-sm md:text-base max-w-lg">
                Tell us where you&apos;d like us to deliver — it goes straight to our team as a
                support ticket, just like any other message.
              </p>
            </div>
            <Link
              href="/contact?subject=Request%20a%20Delivery%20Zone"
              className="inline-flex items-center gap-2 bg-[#fec700] text-[#1a1c1c] font-body font-semibold px-8 py-4 rounded-full hover:bg-white transition-colors text-base flex-shrink-0"
            >
              <Icon icon="mdi:map-marker-plus-outline" width={20} />
              Request a Zone
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          ZONES
      ══════════════════════════════════════════════════════ */}
      <section id="zones" className="scroll-mt-[100px] px-4 md:px-8 pb-20 bg-[#f9f9f9] dark:bg-gray-900 transition-colors">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-center pt-16 mb-10"
          >
            <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[28px] md:text-[36px] tracking-[-0.5px] mb-3">
              Delivery Zones
            </h2>
            <p className="font-body text-[#40493c] dark:text-gray-400 text-[15px] max-w-lg mx-auto">
              Pick a county to see delivery fees for that area, or browse all zones nationwide.
            </p>
          </motion.div>

          {/* Info cards — sourced live from /api/delivery-pricing so figures never drift from checkout */}
          {(pickupInfo || fallbackInfo) && (
            <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-10">
              {pickupInfo && (
                <div className="bg-white dark:bg-gray-950 rounded-2xl p-5 border border-[#e8fce3] dark:border-gray-800 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-[#e8fce3] dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                    <Icon icon="mdi:storefront-outline" width={22} className="text-[#27731e] dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-body text-[#40493c] dark:text-gray-400 text-xs">Pickup at any branch</p>
                    <p className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-base">
                      {pickupInfo.feeKes === 0 ? "Free" : `KES ${(pickupInfo.feeKes / 100).toLocaleString("en-KE")}`}
                    </p>
                  </div>
                </div>
              )}
              {fallbackInfo && (
                <div className="bg-white dark:bg-gray-950 rounded-2xl p-5 border border-[#e8fce3] dark:border-gray-800 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-[#e8fce3] dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                    <Icon icon="mdi:truck-delivery-outline" width={22} className="text-[#27731e] dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-body text-[#40493c] dark:text-gray-400 text-xs">Other areas in Kenya</p>
                    <p className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-base">
                      From KES {(fallbackInfo.feeKes / 100).toLocaleString("en-KE")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* County filter */}
          <div className="flex justify-center mb-10">
            <div className="w-full sm:w-80">
              <label htmlFor="county-select" className="font-body text-[#40493c] dark:text-gray-400 text-xs mb-1.5 block">
                Filter by county
              </label>
              <select
                id="county-select"
                value={selectedCounty}
                onChange={(e) => setSelectedCounty(e.target.value)}
                className="w-full border border-[#c0cab8] dark:border-gray-600 rounded-[8px] px-4 py-3 font-body text-[14px] text-[#1a1c1c] dark:text-white bg-white dark:bg-gray-800 outline-none focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] cursor-pointer transition-colors"
              >
                <option value={ALL_ZONES}>All Zones</option>
                {counties.map((county) => (
                  <option key={county} value={county}>
                    {county}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Zone results */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[#40493c] dark:text-gray-400">
              <Icon icon="mdi:loading" width={20} className="animate-spin" />
              <span className="font-body text-sm">Loading delivery zones…</span>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <Icon icon="mdi:alert-circle-outline" width={32} className="text-[#ef4444] mx-auto mb-3" />
              <p className="font-body text-[#40493c] dark:text-gray-400 text-sm">{error}</p>
            </div>
          ) : zones.length === 0 ? (
            <div className="text-center py-16">
              <Icon icon="mdi:map-marker-off-outline" width={32} className="text-[#40493c]/50 dark:text-gray-600 mx-auto mb-3" />
              <p className="font-body text-[#40493c] dark:text-gray-400 text-sm">
                No delivery zones are configured yet — check back soon, or request one below.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {groupedByCounty.map(({ county, zones: countyZones }) =>
                countyZones.length === 0 ? null : (
                  <div key={county}>
                    {selectedCounty === ALL_ZONES && (
                      <h3 className="font-heading font-semibold text-[#27731e] dark:text-green-400 text-lg mb-4">
                        {county}
                      </h3>
                    )}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {countyZones.map((zone, i) => (
                        <ZoneCard key={zone.id} zone={zone} delay={i * 0.05} />
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
