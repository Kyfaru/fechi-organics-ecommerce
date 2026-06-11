"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQuery } from "@tanstack/react-query";
import { SkeletonCard } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecentMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  status: string;
  createdAt: string;
};

type DashboardData = {
  // existing fields — unchanged
  totalProducts: number;
  activeProducts: number;
  totalCustomers: number;
  newMessages: number;
  totalCategories: number;
  recentMessages: RecentMessage[];
  // NEW — API may not return these yet; fall back to 0 via ?? operator
  totalOrders: number;
  pendingOrders: number;
};

// ---------------------------------------------------------------------------
// Placeholder weekly activity data (Mon–Sun)
// Used until the API exposes time-series data.
// Shape: { day: string; value: number }
// ---------------------------------------------------------------------------

const WEEKLY_ACTIVITY = [
  { day: "Mon", value: 4 },
  { day: "Tue", value: 7 },
  { day: "Wed", value: 5 },
  { day: "Thu", value: 9 },
  { day: "Fri", value: 6 },
  { day: "Sat", value: 11 },
  { day: "Sun", value: 8 },
];

// ---------------------------------------------------------------------------
// Stat card config — 6 tiles (Categories dropped, Orders added)
// ---------------------------------------------------------------------------

const STAT_CARDS = [
  {
    label: "Total Products",
    key: "totalProducts" as keyof Omit<DashboardData, "recentMessages">,
    icon: "mdi:package-variant-closed",
    // brand green for product metrics
    color: "#27731E",
    bg: "#e8fce3",
    darkBg: "#1a2e19",
    trend: "▲ 2 this week",
    trendColor: "#27731E",
  },
  {
    label: "Active Products",
    key: "activeProducts" as keyof Omit<DashboardData, "recentMessages">,
    icon: "mdi:check-circle-outline",
    color: "#368B2B",
    bg: "#edfce8",
    darkBg: "#1c2e1a",
    trend: "▲ Live now",
    trendColor: "#368B2B",
  },
  {
    label: "Customers",
    key: "totalCustomers" as keyof Omit<DashboardData, "recentMessages">,
    icon: "mdi:account-group-outline",
    color: "#27731E",
    bg: "#e8fce3",
    darkBg: "#1a2e19",
    trend: "▲ Growing",
    trendColor: "#27731E",
  },
  {
    label: "New Messages",
    key: "newMessages" as keyof Omit<DashboardData, "recentMessages">,
    icon: "mdi:email-outline",
    // yellow accent for messages
    color: "#DEAE00",
    bg: "#fff8e0",
    darkBg: "#2a2410",
    trend: "▲ Unread",
    trendColor: "#DEAE00",
  },
  {
    label: "Total Orders",
    key: "totalOrders" as keyof Omit<DashboardData, "recentMessages">,
    icon: "mdi:shopping-outline",
    color: "#FFC800",
    bg: "#fffbea",
    darkBg: "#2a2718",
    trend: "▲ All time",
    trendColor: "#FFC800",
  },
  {
    label: "Pending Orders",
    key: "pendingOrders" as keyof Omit<DashboardData, "recentMessages">,
    icon: "mdi:clock-outline",
    color: "#DEAE00",
    bg: "#fff8e0",
    darkBg: "#2a2410",
    trend: "▲ Awaiting",
    trendColor: "#DEAE00",
  },
] satisfies {
  label: string;
  key: keyof Omit<DashboardData, "recentMessages">;
  icon: string;
  color: string;
  bg: string;
  darkBg: string;
  trend: string;
  trendColor: string;
}[];

// ---------------------------------------------------------------------------
// Quick actions config — unchanged from original
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  {
    label: "Add Product",
    href: "/admin/products",
    icon: "mdi:plus-circle-outline",
    color: "#27731E",
  },
  {
    label: "View Messages",
    href: "/admin/contacts",
    icon: "mdi:email-outline",
    color: "#DEAE00",
  },
  {
    label: "Manage Customers",
    href: "/admin/customers",
    icon: "mdi:account-group-outline",
    color: "#27731E",
  },
  {
    label: "Testimonials",
    href: "/admin/testimonials",
    icon: "mdi:star-outline",
    color: "#368B2B",
  },
];

// ---------------------------------------------------------------------------
// SVG Area Chart — pure SVG, no recharts dependency
// Renders a smooth bezier area chart for weekly activity data.
// ---------------------------------------------------------------------------

function ActivityChart({ data }: { data: typeof WEEKLY_ACTIVITY }) {
  const W = 600;
  const H = 140;
  // vertical padding inside the SVG viewport
  const PAD_TOP = 12;
  const PAD_BOTTOM = 24;

  const maxVal = Math.max(...data.map((d) => d.value));
  const plotH = H - PAD_TOP - PAD_BOTTOM;

  // Map each data point to SVG coordinates
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: PAD_TOP + plotH * (1 - d.value / maxVal),
    ...d,
  }));

  // Build a smooth cubic bezier path through the points
  function buildPath(pts: typeof points): string {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cp1x = pts[i].x + (pts[i + 1].x - pts[i].x) / 3;
      const cp1y = pts[i].y;
      const cp2x = pts[i].x + (2 * (pts[i + 1].x - pts[i].x)) / 3;
      const cp2y = pts[i + 1].y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
    }
    return d;
  }

  const linePath = buildPath(points);
  // Close the area shape down to the baseline
  const areaPath =
    linePath +
    ` L ${points[points.length - 1].x} ${H - PAD_BOTTOM}` +
    ` L ${points[0].x} ${H - PAD_BOTTOM}` +
    " Z";

  return (
    <div className="relative w-full" style={{ paddingBottom: "24%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        aria-label="Weekly activity area chart"
        role="img"
      >
        <defs>
          {/* Gradient fill — brand green fading to transparent */}
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#27731E" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#27731E" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Filled area */}
        <path d={areaPath} fill="url(#chartGradient)" />

        {/* Stroke line */}
        <path
          d={linePath}
          fill="none"
          stroke="#27731E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data point dots */}
        {points.map((pt) => (
          <circle
            key={pt.day}
            cx={pt.x}
            cy={pt.y}
            r="4"
            fill="#27731E"
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}

        {/* X-axis day labels */}
        {points.map((pt) => (
          <text
            key={`label-${pt.day}`}
            x={pt.x}
            y={H}
            textAnchor="middle"
            fontSize="11"
            fill="#a1a1a1"
            fontFamily="system-ui, sans-serif"
          >
            {pt.day}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminDashboardClient() {
  // Fetch dashboard summary — refresh every 30s
  // NOTE: Do NOT change this query key or URL — other agents depend on them.
  const { data, isLoading } = useQuery<{ ok: boolean; data: DashboardData }>({
    queryKey: ["admin-dashboard"],
    queryFn: () => fetch("/api/admin/dashboard").then((r) => r.json()),
    staleTime: 30_000,
  });

  const stats = data?.data;

  // Framer Motion stagger helpers
  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: "easeOut", delay } as const,
  });

  return (
    <div className="p-6 md:p-8 max-w-[1400px]">
      {/* ------------------------------------------------------------------ */}
      {/* Page title                                                           */}
      {/* ------------------------------------------------------------------ */}
      <motion.div {...fadeUp(0)} className="mb-8">
        <h1 className="font-heading font-semibold text-[#1a1c1c] dark:text-[#edf2ec] text-[28px] md:text-[32px]">
          Dashboard
        </h1>
        <p className="font-body text-[#40493c] dark:text-[#b0bfac] text-[14px] mt-1">
          Welcome back — here's what's happening
        </p>
      </motion.div>

      {/* ================================================================== */}
      {/* ROW 1 — 6 stat cards                                                */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="h-[130px]" />
            ))
          : STAT_CARDS.map((card, idx) => (
              <motion.div
                key={card.label}
                {...fadeUp(idx * 0.05)}
                className="bg-white dark:bg-[#1a1f18] rounded-[20px] p-5
                           border border-[#f0f0f0] dark:border-[#2d3a2b]
                           shadow-[0_2px_10px_rgba(0,0,0,0.05)]
                           flex flex-col gap-3"
              >
                {/* Icon badge */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: card.bg }}
                >
                  <Icon
                    icon={card.icon}
                    width={20}
                    style={{ color: card.color }}
                  />
                </div>

                {/* Label */}
                <p className="font-body text-[#a1a1a1] dark:text-[#6b7f69] text-[11px] uppercase tracking-[0.6px] leading-tight">
                  {card.label}
                </p>

                {/* Value */}
                <p className="font-heading font-bold text-[#1a1c1c] dark:text-[#edf2ec] text-[26px] leading-none -mt-1">
                  {/* Fall back to 0 for new fields until API is updated */}
                  {stats?.[card.key] ?? 0}
                </p>

                {/* Trend indicator — static placeholder */}
                <p
                  className="font-body text-[11px] leading-tight"
                  style={{ color: card.trendColor }}
                >
                  {card.trend}
                </p>
              </motion.div>
            ))}
      </div>

      {/* ================================================================== */}
      {/* ROW 2 — Activity chart (2 cols) + Quick Actions (1 col)             */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Activity chart panel ------------------------------------------ */}
        <motion.div
          {...fadeUp(0.35)}
          className="lg:col-span-2 bg-white dark:bg-[#1a1f18]
                     rounded-[20px] border border-[#f0f0f0] dark:border-[#2d3a2b]
                     shadow-[0_2px_10px_rgba(0,0,0,0.05)]
                     overflow-hidden"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0] dark:border-[#2d3a2b]">
            <div>
              <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-[#edf2ec] text-[16px]">
                Messages This Week
              </h2>
              <p className="font-body text-[#a1a1a1] text-[12px] mt-0.5">
                Activity overview — Mon to Sun
              </p>
            </div>
            {/* Legend dot */}
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#27731E" }}
              />
              <span className="font-body text-[#40493c] dark:text-[#b0bfac] text-[12px]">
                Messages
              </span>
            </div>
          </div>

          {/* Chart body */}
          <div className="px-6 pt-5 pb-3">
            {/* TODO: Replace WEEKLY_ACTIVITY with real time-series data from /api/admin/dashboard
                once the endpoint exposes weekly message counts. */}
            <ActivityChart data={WEEKLY_ACTIVITY} />

            {/* Quick stats row below chart */}
            <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-[#f0f0f0] dark:border-[#2d3a2b]">
              {[
                { label: "Peak day", value: "Saturday" },
                { label: "This week", value: "50 msgs" },
                { label: "Avg / day", value: "7.1" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="font-heading font-semibold text-[#1a1c1c] dark:text-[#edf2ec] text-[14px]">
                    {stat.value}
                  </p>
                  <p className="font-body text-[#a1a1a1] text-[11px] mt-0.5">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Quick actions -------------------------------------------------- */}
        <motion.div
          {...fadeUp(0.40)}
          className="bg-white dark:bg-[#1a1f18]
                     rounded-[20px] border border-[#f0f0f0] dark:border-[#2d3a2b]
                     shadow-[0_2px_10px_rgba(0,0,0,0.05)] p-6"
        >
          <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-[#edf2ec] text-[16px] mb-5">
            Quick Actions
          </h2>

          <div className="flex flex-col gap-3">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 p-4 rounded-[12px]
                           border border-[#f0f0f0] dark:border-[#2d3a2b]
                           hover:border-[#27731E] hover:bg-[#f4fff3]
                           dark:hover:border-[#368B2B] dark:hover:bg-[#1a2e19]
                           transition-all duration-200 group"
              >
                <Icon
                  icon={action.icon}
                  width={20}
                  style={{ color: action.color }}
                />
                <span className="font-body text-[#40493c] dark:text-[#b0bfac] text-[14px] group-hover:text-[#27731E] dark:group-hover:text-[#7FDE6C] transition-colors">
                  {action.label}
                </span>
                <Icon
                  icon="mdi:chevron-right"
                  width={16}
                  className="ml-auto"
                  style={{ color: "#c0cab8" }}
                />
              </Link>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ================================================================== */}
      {/* ROW 3 — Recent Messages (full width)                               */}
      {/* ================================================================== */}
      <motion.div
        {...fadeUp(0.5)}
        className="bg-white dark:bg-[#1a1f18]
                   rounded-[20px] border border-[#f0f0f0] dark:border-[#2d3a2b]
                   shadow-[0_2px_10px_rgba(0,0,0,0.05)]
                   overflow-hidden"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0] dark:border-[#2d3a2b]">
          <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-[#edf2ec] text-[16px]">
            Recent Messages
          </h2>
          <Link
            href="/admin/contacts"
            className="font-body text-[#27731E] text-[13px] hover:underline"
          >
            View all
          </Link>
        </div>

        {/* Table header row */}
        <div className="hidden md:grid md:grid-cols-[1fr_2fr_1fr_80px] gap-4 px-6 py-3 bg-[#fafafa] dark:bg-[#151a14] border-b border-[#f0f0f0] dark:border-[#2d3a2b]">
          {["Sender", "Subject", "Status", "Date"].map((col) => (
            <span
              key={col}
              className="font-body text-[#a1a1a1] text-[11px] uppercase tracking-[0.6px]"
            >
              {col}
            </span>
          ))}
        </div>

        {/* Message rows */}
        <div className="divide-y divide-[#f0f0f0] dark:divide-[#2d3a2b]">
          {isLoading ? (
            // Loading skeleton rows
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="px-6 py-4 flex gap-3 items-center animate-pulse"
              >
                <div
                  className="w-8 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "#e8fce3" }}
                />
                <div className="flex-1 flex flex-col gap-2">
                  <div
                    className="h-3 rounded w-1/4"
                    style={{ backgroundColor: "#e8fce3" }}
                  />
                  <div
                    className="h-3 rounded w-1/2"
                    style={{ backgroundColor: "#e8fce3" }}
                  />
                </div>
              </div>
            ))
          ) : (stats?.recentMessages ?? []).length === 0 ? (
            // Empty state
            <div className="px-6 py-12 text-center">
              <Icon
                icon="mdi:email-outline"
                width={32}
                style={{ color: "#c0cab8", margin: "0 auto 8px" }}
              />
              <p className="font-body text-[#a1a1a1] text-[14px]">
                No messages yet
              </p>
            </div>
          ) : (
            stats?.recentMessages.map((msg, idx) => (
              <motion.div
                key={msg.id}
                {...fadeUp(0.5 + idx * 0.04)}
                className="px-6 py-4 grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr_80px] gap-2 md:gap-4
                           items-center hover:bg-[#fafafa] dark:hover:bg-[#1e261c] transition-colors"
              >
                {/* Sender */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Status dot */}
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor:
                        msg.status === "new"
                          ? "#FFC800"
                          : msg.status === "read"
                          ? "#27731E"
                          : "#c4c4c4",
                    }}
                  />
                  <div className="min-w-0">
                    <p className="font-body font-semibold text-[#1a1c1c] dark:text-[#edf2ec] text-[13px] truncate">
                      {msg.name}
                    </p>
                    <p className="font-body text-[#a1a1a1] text-[11px] truncate">
                      {msg.email}
                    </p>
                  </div>
                </div>

                {/* Subject */}
                <p className="font-body text-[#40493c] dark:text-[#b0bfac] text-[13px] truncate pl-5 md:pl-0">
                  {msg.subject}
                </p>

                {/* Status badge */}
                <div className="pl-5 md:pl-0">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-body font-medium"
                    style={
                      msg.status === "new"
                        ? {
                            backgroundColor: "#FFF2C0",
                            color: "#DEAE00",
                          }
                        : msg.status === "read"
                        ? {
                            backgroundColor: "#e8fce3",
                            color: "#27731E",
                          }
                        : {
                            backgroundColor: "#f3f3f3",
                            color: "#40493c",
                          }
                    }
                  >
                    {msg.status === "new"
                      ? "New"
                      : msg.status === "read"
                      ? "Read"
                      : "Archived"}
                  </span>
                </div>

                {/* Date */}
                <span className="font-body text-[#a1a1a1] text-[11px] pl-5 md:pl-0 flex-shrink-0">
                  {new Date(msg.createdAt).toLocaleDateString("en-KE", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
