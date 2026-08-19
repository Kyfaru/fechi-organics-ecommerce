"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import PageHeader from "@/components/account/PageHeader";
import { GenericSkeleton } from "@/components/account/AccountSkeleton";
import { toast } from "@/lib/toast";
import { ACHIEVEMENTS_QUERY_KEY } from "./AchievementsClient";

const LEADERBOARD_QUERY_KEY = ["leaderboard"] as const;

type Row = {
  rank: number;
  isSelf: boolean;
  userCode: string;
  displayName: string;
  image: string | null;
  points: number;
  badgeCount: number;
  level: number;
};

type LeaderboardData = {
  board: Row[];
  me: {
    rank: number | null;
    userCode: string;
    points: number;
    badgeCount: number;
    level: number;
    leaderboardPublic: boolean;
    inTopN: boolean;
  } | null;
};

async function fetchLeaderboard(): Promise<LeaderboardData> {
  const res = await fetch("/api/account/achievements/leaderboard");
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Failed to load leaderboard");
  return json.data;
}

export default function LeaderboardClient() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: LEADERBOARD_QUERY_KEY,
    queryFn: fetchLeaderboard,
  });

  const toggle = useMutation({
    mutationFn: async (leaderboardPublic: boolean) => {
      const res = await fetch("/api/account/achievements/leaderboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderboardPublic }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Could not update your preference");
      return json.data;
    },
    onSuccess: (d: { leaderboardPublic: boolean }) => {
      toast.success(
        d.leaderboardPublic
          ? "Your name and photo are now shown on the leaderboard"
          : "You're back to appearing as your code only",
      );
      qc.invalidateQueries({ queryKey: LEADERBOARD_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ACHIEVEMENTS_QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <GenericSkeleton />;
  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Could not load the leaderboard. Please refresh to try again.
      </div>
    );
  }

  const { board, me } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          icon="lucide:bar-chart-3"
          eyebrow="Rewards"
          title="Leaderboard"
          description="Ranked by points earned all-time — spending your points never costs you your place."
        />
        <Link
          href="/account/achievements"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#15803D] hover:underline shrink-0 mt-2"
        >
          <Icon icon="lucide:arrow-left" width={15} />
          Back to achievements
        </Link>
      </div>

      {/* Privacy control. Masked is the default — a purchase-derived public
          ranking is personal data, so appearing by name is opt-in. */}
      {me && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-neutral-900">How you appear</h2>
              <p className="mt-0.5 text-sm text-neutral-500">
                {me.leaderboardPublic
                  ? "Everyone can see your username and photo here."
                  : `Others see you only as ${me.userCode}. Your rank is always visible to you.`}
              </p>
            </div>
            <button
              type="button"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate(!me.leaderboardPublic)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                me.leaderboardPublic
                  ? "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  : "bg-[#15803D] text-white hover:bg-[#166534]"
              }`}
            >
              {me.leaderboardPublic ? "Hide my name" : "Show my name"}
            </button>
          </div>

          {me.rank !== null && !me.inTopN && (
            <p className="mt-3 rounded-lg bg-[#F0FDF4] border border-[#DCFCE7] px-3 py-2 text-sm text-[#15803D]">
              You&apos;re currently ranked <strong>#{me.rank}</strong> with{" "}
              {me.points.toLocaleString()} points.
            </p>
          )}
          {me.rank === null && (
            <p className="mt-3 text-sm text-neutral-400">
              Place your first order to join the leaderboard.
            </p>
          )}
        </div>
      )}

      {board.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
          Nobody has earned points yet. Be the first.
        </p>
      ) : (
        <ol className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          {board.map((row) => (
            <li
              key={row.userCode}
              className={`flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-0 ${
                row.isSelf ? "bg-[#F0FDF4]" : ""
              }`}
            >
              <span
                className={`w-8 shrink-0 text-center text-sm font-bold ${
                  row.rank === 1
                    ? "text-amber-500"
                    : row.rank === 2
                      ? "text-neutral-400"
                      : row.rank === 3
                        ? "text-amber-700"
                        : "text-neutral-300"
                }`}
              >
                {row.rank}
              </span>

              {row.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.image}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                  <Icon icon="lucide:user" width={16} className="text-neutral-400" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {row.displayName}
                  {row.isSelf && <span className="ml-2 text-xs text-[#15803D]">You</span>}
                </p>
                <p className="text-xs text-neutral-400">
                  Level {row.level} · {row.badgeCount} achievements
                </p>
              </div>

              <span className="shrink-0 text-sm font-bold text-neutral-900">
                {row.points.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
