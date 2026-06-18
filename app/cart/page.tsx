import { CartClient } from "@/components/cart/CartClient";
import { Navbar } from "@/components/layout/Navbar";

export const metadata = {
  title: "Cart | Fechi Organics",
  description: "Review your cart and proceed to checkout.",
};

export default function CartPage() {
  return (
    <div className="min-h-screen bg-[#f9f9f9] dark:bg-gray-950 flex flex-col">
      <Navbar />
      <CartClient />
    </div>
  );
}
