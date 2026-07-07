import { Suspense } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ContactClient } from "@/components/contact/ContactClient";

export const metadata = {
  title: "Contact Us | Fechi Organics",
  description: "Get in touch with Fechi Organics. Find our branches, send a message, or reach us by phone or email.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      {/* ContactClient reads useSearchParams() to pre-fill the subject/message
          from the /shipping page's "Request a Zone" CTA, which requires a
          Suspense boundary (matches the pattern in app/shop/page.tsx). */}
      <Suspense>
        <ContactClient />
      </Suspense>
      <Footer />
    </main>
  );
}
