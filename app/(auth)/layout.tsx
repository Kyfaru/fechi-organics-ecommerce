/**
 * Auth group layout.
 * Provides a full-viewport container with no header or footer.
 * Both /login and /signup share this shell.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fechi Organics — Auth",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen w-full">{children}</div>;
}
