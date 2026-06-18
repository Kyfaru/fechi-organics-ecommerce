import type { Metadata } from "next";
import { WishlistClient } from "@/components/wishlist/WishlistClient";

export const metadata: Metadata = {
  title: "My Wishlist | Fechi Organics",
  description: "Your saved Fechi Organics favourites.",
};

/**
 * /wishlist — Wishlist page.
 * Navbar and Footer are provided by AccountLayout inside WishlistClient.
 */
export default function WishlistPage() {
  return <WishlistClient />;
}
