import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PrivacyPolicyContent } from "@/components/legal/PrivacyPolicyContent";

export const metadata: Metadata = {
  title: "Privacy Policy | Fechi Organics",
  description:
    "How we collect, use, and protect your personal data — in compliance with the Kenya Data Protection Act 2019.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <PrivacyPolicyContent />
      <Footer />
    </main>
  );
}
