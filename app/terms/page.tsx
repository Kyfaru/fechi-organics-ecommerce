import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { TermsContent } from "@/components/legal/TermsContent";

export const metadata: Metadata = {
  title: "Terms & Conditions | Fechi Organics",
  description:
    "The terms that govern your use of the Fechi Organics website and purchase of our products, in accordance with Kenyan law.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <TermsContent />
      <Footer />
    </main>
  );
}
