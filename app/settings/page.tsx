import type { Metadata } from "next";
import { AccountSettingsClient } from "@/components/account/AccountSettingsClient";

export const metadata: Metadata = {
  title: "Account Settings | Fechi Organics",
  description: "Manage your profile, password, and notification preferences.",
};

/**
 * /settings — Account settings page.
 *
 * Rendered as a simple server component shell; all interactive logic
 * lives in AccountSettingsClient which uses useSession() client-side.
 */
export default function SettingsPage() {
  return <AccountSettingsClient />;
}
