"use client";
import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Marker,
} from "react-simple-maps";
import { cn } from "@/lib/utils";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// African countries ISO alpha-3 codes → display colors
const AFRICAN_COLORS: Record<string, string> = {
  DZA: "#059669", EGY: "#10b981", LBY: "#34d399", TUN: "#6ee7b7", MAR: "#a7f3d0",
  MRT: "#065f46", MLI: "#047857", NER: "#0f766e", TCD: "#0e7490", SDN: "#0369a1",
  SEN: "#1d4ed8", GMB: "#2563eb", GNB: "#3b82f6", GIN: "#60a5fa", SLE: "#93c5fd",
  LBR: "#7c3aed", CIV: "#8b5cf6", BFA: "#a78bfa", GHA: "#c4b5fd", TGO: "#6d28d9",
  BEN: "#4c1d95", NGA: "#d97706", CMR: "#f59e0b", CAF: "#fbbf24", GAB: "#fcd34d",
  COG: "#fde68a", COD: "#b45309", AGO: "#92400e", ZMB: "#78350f", ZWE: "#dc2626",
  MOZ: "#ef4444", MWI: "#f87171", TZA: "#fca5a5", KEN: "#be185d", UGA: "#db2777",
  RWA: "#ec4899", BDI: "#f472b6", ETH: "#9d174d", ERI: "#831843", DJI: "#6b21a8",
  SOM: "#7e22ce", SWZ: "#16a34a", LSO: "#15803d", BWA: "#166534", NAM: "#14532d",
  ZAF: "#15803d", MDG: "#0c4a6e", COM: "#164e63", STP: "#134e4a", CPV: "#1e3a5f",
};

// Major non-African countries
const COUNTRY_COLORS: Record<string, string> = {
  USA: "#3B82F6", GBR: "#8B5CF6", DEU: "#F59E0B", CHN: "#EF4444",
  JPN: "#10B981", IND: "#F97316", FRA: "#06B6D4", BRA: "#84CC16",
  CAN: "#EC4899", AUS: "#14B8A6", SGP: "#6366F1", ARE: "#F43F5E",
  SAU: "#A855F7", KOR: "#22D3EE", ITA: "#FB923C", ESP: "#A3E635",
  NLD: "#34D399", CHE: "#F472B6", SWE: "#818CF8", NOR: "#38BDF8",
};

const DEFAULT_COLOR = "#94A3B8";

export interface WorldOrdersData {
  countryCode: string;
  orders: number;
}

export function generateMockWorldOrdersData(): WorldOrdersData[] {
  const countries = [
    "KEN", "NGA", "ZAF", "GHA", "TZA", "ETH", "UGA", "EGY", "MAR", "DZA",
    "USA", "GBR", "DEU", "CHN", "JPN", "IND", "FRA", "BRA", "CAN", "AUS",
  ];
  return countries.map((c) => ({ countryCode: c, orders: Math.floor(Math.random() * 500) + 10 }));
}

interface WorldOrdersMapProps {
  data?: WorldOrdersData[];
  height?: number;
  className?: string;
  showContinent?: string | null;
}

export function WorldOrdersMap({
  data = [],
  height = 360,
  className,
  showContinent,
}: WorldOrdersMapProps) {
  const [tooltip, setTooltip] = useState<{ name: string; orders: number; x: number; y: number } | null>(null);

  const ordersByCode: Record<string, number> = {};
  data.forEach((d) => { ordersByCode[d.countryCode] = d.orders; });

  const getColor = (code: string) => {
    if (AFRICAN_COLORS[code]) return AFRICAN_COLORS[code];
    if (COUNTRY_COLORS[code]) return COUNTRY_COLORS[code];
    return DEFAULT_COLOR;
  };

  return (
    <div className={cn("relative w-full rounded-xl overflow-hidden bg-neutral-50 dark:bg-neutral-900", className)} style={{ height }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120, center: [20, 10] }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup zoom={1}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (geographies as any[]).map((geo: { rsmKey: string; id?: string; properties: { name: string } }) => {
                const code = geo.id ?? "";
                const orders = ordersByCode[code] ?? 0;
                const color = getColor(code);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={color}
                    fillOpacity={orders > 0 ? 1 : 0.4}
                    stroke="#fff"
                    strokeWidth={0.3}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fillOpacity: 0.8, cursor: "pointer" },
                      pressed: { outline: "none" },
                    }}
                    onMouseEnter={(e: React.MouseEvent) => {
                      const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                      setTooltip({
                        name: geo.properties.name,
                        orders,
                        x: e.clientX - (rect?.left ?? 0),
                        y: e.clientY - (rect?.top ?? 0) - 40,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-lg dark:bg-dark-surface dark:border-dark-border text-xs"
          style={{ left: tooltip.x + 8, top: tooltip.y }}
        >
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">{tooltip.name}</p>
          <p className="text-neutral-500">{tooltip.orders.toLocaleString()} orders</p>
        </div>
      )}
    </div>
  );
}
