import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CreateTestimonyClient } from "@/components/testimonials/CreateTestimonyClient";

export const metadata = {
  title: "Share Your Story | Fechi Organics",
  description: "Tell us about your experience with Fechi Organics products.",
};

export default function CreateTestimonyPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-950 overflow-x-hidden">
      <Navbar flat />
      <CreateTestimonyClient />
      <Footer />
    </main>
  );
}
