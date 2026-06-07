import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WishlistClient } from "@/components/wishlist/WishlistClient";

export const metadata = {
  title: "My Wishlist | Fechi Organics",
  description: "Your saved Fechi Organics favourites.",
};

export default function WishlistPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <WishlistClient />
      <Footer />
    </main>
  );
}
