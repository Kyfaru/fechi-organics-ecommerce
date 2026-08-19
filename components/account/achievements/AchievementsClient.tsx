"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import CircularProgress from "@/components/ui/CircularProgress";
import PageHeader from "@/components/account/PageHeader";
import { GenericSkeleton } from "@/components/account/AccountSkeleton";
import { useDeviceSignal } from "@/hooks/use-device-signal";
import { buildInviteMessage, buildWhatsAppShareUrl } from "@/lib/points/invite-message";
import { toast } from "@/lib/toast";

export const ACHIEVEMENTS_QUERY_KEY = ["achievements"] as const;

type Badge = {
  id: string;
  familyKey: string;
  tier: number;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  points: number;
  grantType: "AUTO" | "MANUAL";
  threshold: number | null;
  current: number | null;
  percent: number;
  earned: boolean;
  earnedAt: string | null;
};

type AchievementsData = {
  userCode: string;
  referralCode: string;
  referralsUsed: number;
  referralsRemaining: number;
  referralsPending: number;
  leaderboardPublic: boolean;
  points: {
    available: number;
    locked: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    centsPerPoint: number;
    cashValueCents: number;
  };
  level: {
    level: number;
    nextLevel: number | null;
    badgesIntoLevel: number;
    badgesForNextLevel: number | null;
    percent: number;
  };
  badgeCount: number;
  totalBadges: number;
  badges: Badge[];
};

const RARITY_STYLES: Record<string, string> = {
  COMMON: "bg-neutral-100 text-neutral-600 border-neutral-200",
  UNCOMMON: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RARE: "bg-sky-50 text-sky-700 border-sky-200",
  EPIC: "bg-violet-50 text-violet-700 border-violet-200",
  LEGENDARY: "bg-amber-50 text-amber-700 border-amber-200",
  MYTHIC: "bg-rose-50 text-rose-700 border-rose-200",
};

function kes(cents: number) {
  return `KSh ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

async function fetchAchievements(): Promise<AchievementsData> {
  const res = await fetch("/api/account/achievements");
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Failed to load achievements");
  return json.data;
}

export default function AchievementsClient() {
  // Records this browser so the anti-farming score has evidence by the time
  // the joining bonus unlocks at first payment.
  useDeviceSignal();

  const [filter, setFilter] = useState<"all" | "earned" | "locked">("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ACHIEVEMENTS_QUERY_KEY,
    queryFn: fetchAchievements,
    // The app-wide defaults are staleTime 60s, gcTime 24h, refetchOnMount
    // false, and the cache is persisted to localStorage — so a result fetched
    // once is reused across sessions for a day and never revalidated. That is
    // wrong for this page: points and achievements change on every order, and
    // anyone who opened it while the points engine was down kept an empty
    // result long after it was fixed. Always revalidate on mount.
    staleTime: 0,
    refetchOnMount: "always",
  });

  const visible = useMemo(() => {
    if (!data) return [];
    if (filter === "earned") return data.badges.filter((b) => b.earned);
    if (filter === "locked") return data.badges.filter((b) => !b.earned);
    return data.badges;
  }, [data, filter]);

  if (isLoading) return <GenericSkeleton />;
  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Could not load your achievements. Please refresh to try again.
      </div>
    );
  }

  const { points, level } = data;

  // window.location.origin, not NEXT_PUBLIC_APP_URL — the link should point at
  // whatever host the customer is actually on.
  const inviteMessage = buildInviteMessage({
    referralCode: data.referralCode,
    baseUrl: typeof window !== "undefined" ? window.location.origin : "",
  });

  return (
    <div className="space-y-8">
      <PageHeader
        icon="lucide:trophy"
        eyebrow="Rewards"
        title="Achievements"
        description="Earn Fechi points on every order and unlock achievements as you go."
      />

      {/* Points + level summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#14532D] text-white p-6 md:col-span-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-300">
            Your Fechi Points
          </span>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-4xl font-bold leading-none">
              {points.available.toLocaleString()}
            </span>
            <span className="text-sm text-emerald-100">worth {kes(points.cashValueCents)}</span>
          </div>

          {points.locked > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-white/10 p-3">
              <Icon icon="lucide:lock" width={16} className="mt-0.5 shrink-0 text-amber-300" />
              <p className="text-sm text-emerald-50">
                <strong>{points.locked.toLocaleString()} points</strong> are waiting — they unlock
                automatically with your first order.
              </p>
            </div>
          )}

          <div className="mt-5 flex gap-6 text-sm text-emerald-100">
            <div>
              <p className="font-semibold text-white">{points.lifetimeEarned.toLocaleString()}</p>
              <p className="text-xs">Earned all-time</p>
            </div>
            <div>
              <p className="font-semibold text-white">{points.lifetimeRedeemed.toLocaleString()}</p>
              <p className="text-xs">Spent</p>
            </div>
            <div>
              <p className="font-semibold text-white">{data.userCode}</p>
              <p className="text-xs">Your code</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 flex flex-col items-center justify-center text-center">
          <CircularProgress percent={level.percent} size={88} strokeWidth={8} />
          <p className="mt-3 text-2xl font-bold text-neutral-900">Level {level.level}</p>
          <p className="text-sm text-neutral-500">
            {data.badgeCount} of {data.totalBadges.toLocaleString()} achievements
          </p>
          {level.badgesForNextLevel !== null && (
            <p className="mt-1 text-xs text-neutral-400">
              {level.badgesForNextLevel} more to reach level {level.nextLevel}
            </p>
          )}
        </div>
      </div>

      {/* Referral + leaderboard links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <Icon icon="lucide:users" width={16} className="text-[#15803D]" />
            <h2 className="text-sm font-bold text-neutral-900">Invite friends</h2>
          </div>
          <p className="text-sm text-neutral-500">
            They get 10% off their first order. You earn 1,000 points when they buy, and they start
            with 500 of their own.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-[#F0FDF4] border border-[#DCFCE7] px-3 py-2 font-mono text-sm text-[#15803D]">
              {data.referralCode}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(data.referralCode)
                  .then(() => toast.success("Code copied"))
                  .catch(() => toast.error("Could not copy — select the code manually"));
              }}
              className="rounded-lg border border-[#15803D] px-3 py-2 text-sm font-medium text-[#15803D] hover:bg-[#F0FDF4] transition-colors"
            >
              Code
            </button>
          </div>

          {/* The whole invite, ready to paste into WhatsApp or SMS. */}
          <p className="mt-3 rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-xs leading-relaxed text-neutral-600">
            {inviteMessage}
          </p>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(inviteMessage)
                  .then(() => toast.success("Invite copied — paste it into WhatsApp or SMS"))
                  .catch(() => toast.error("Could not copy — select the message manually"));
              }}
              className="flex-1 rounded-lg bg-[#15803D] px-3 py-2 text-sm font-medium text-white hover:bg-[#166534] transition-colors"
            >
              Copy invite
            </button>
            <a
              href={buildWhatsAppShareUrl(inviteMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <Icon icon="lucide:message-circle" width={15} />
              WhatsApp
            </a>
          </div>

          <p className="mt-2 text-xs text-neutral-400">
            {data.referralsRemaining} of 5 invites left
            {data.referralsPending > 0 ? ` · ${data.referralsPending} yet to order` : ""}
          </p>
        </div>

        <Link
          href="/account/achievements/leaderboard"
          className="rounded-xl border border-neutral-200 bg-white p-5 hover:border-[#15803D] transition-colors group"
        >
          <div className="flex items-center gap-2 mb-2">
            <Icon icon="lucide:bar-chart-3" width={16} className="text-[#15803D]" />
            <h2 className="text-sm font-bold text-neutral-900">Leaderboard</h2>
          </div>
          <p className="text-sm text-neutral-500">
            See how you rank against other Fechi customers.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#15803D]">
            View rankings
            <Icon
              icon="lucide:arrow-right"
              width={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </Link>
      </div>

      {/* Badge grid */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-bold text-neutral-900">Achievements</h2>
          <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
            {(["all", "earned", "locked"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  filter === f ? "bg-white text-[#15803D] shadow-sm" : "text-neutral-500"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
            Nothing here yet — place an order to start unlocking achievements.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map((b) => (
              <BadgeCard key={b.id} badge={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        badge.earned ? "border-[#DCFCE7] bg-[#F0FDF4]" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            badge.earned ? "bg-[#15803D] text-white" : "bg-neutral-100 text-neutral-400"
          }`}
        >
          <Icon icon={badge.earned ? `lucide:${badge.icon}` : "lucide:lock"} width={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-neutral-900 truncate">{badge.name}</h3>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                RARITY_STYLES[badge.rarity] ?? RARITY_STYLES.COMMON
              }`}
            >
              {badge.rarity}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">{badge.description}</p>

          {!badge.earned && badge.threshold !== null && badge.current !== null && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-[#15803D] transition-[width] duration-300"
                  style={{ width: `${badge.percent}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">
                {badge.current.toLocaleString()} / {badge.threshold.toLocaleString()}
              </p>
            </div>
          )}

          <p className="mt-2 text-[11px] font-medium text-[#15803D]">
            {badge.points > 0 ? `+${badge.points.toLocaleString()} points` : "In-house recognition"}
          </p>
        </div>
      </div>
    </div>
  );
}
