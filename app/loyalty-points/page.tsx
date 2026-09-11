import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { LoyaltyPointsContent } from "@/components/legal/LoyaltyPointsContent";

export const metadata: Metadata = {
  title: "Fechi Points | Fechi Organics",
  description:
    "How Fechi Points work: earn points on every order, unlock achievements, invite friends for 10% off, and spend your points straight off the price of a future order.",
};

export default function LoyaltyPointsPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <LoyaltyPointsContent />
      <Footer />
    </main>
  );
}
