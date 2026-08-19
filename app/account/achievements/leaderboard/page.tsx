import type { Metadata } from "next";
import LeaderboardClient from "@/components/account/achievements/LeaderboardClient";

export const metadata: Metadata = {
  title: "Leaderboard | Fechi Organics",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
