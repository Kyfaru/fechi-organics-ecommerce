import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ShippingClient } from "@/components/shipping/ShippingClient";

export const metadata = {
  title: "Shipping & Delivery | Fechi Organics",
  description:
    "See FECHI Organics delivery zones and fees across Kenya, free branch pickup, and how to request a new delivery zone.",
};

export default function ShippingPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <ShippingClient />
      <Footer />
    </main>
  );
}
