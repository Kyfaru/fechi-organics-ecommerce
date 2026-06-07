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
      <ContactClient />
      <Footer />
    </main>
  );
}
