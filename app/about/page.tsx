import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AboutClient } from "@/components/about/AboutClient";

export const metadata = {
  title: "About Us | Fechi Organics",
  description:
    "Discover the story behind FECHI Organics — a proudly Kenyan skincare and wellness brand dedicated to natural beauty, confidence, and healthy living.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <AboutClient />
      <Footer />
    </main>
  );
}
