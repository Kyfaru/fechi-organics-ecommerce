import type { Metadata } from "next";
import AchievementsClient from "@/components/account/achievements/AchievementsClient";

export const metadata: Metadata = {
  title: "Achievements | Fechi Organics",
};

export default function AchievementsPage() {
  // Client-rendered: everything on this page comes from one authenticated
  // endpoint, and the layout above already gates the session.
  return <AchievementsClient />;
}
