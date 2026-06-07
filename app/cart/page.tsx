import { CartClient } from "@/components/cart/CartClient";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@iconify/react";

export const metadata = {
  title: "Cart | Fechi Organics",
  description: "Review your cart and proceed to checkout.",
};

export default function CartPage() {
  return (
    <div className="min-h-screen bg-[#f9f9f9] flex flex-col">
      {/* Minimal checkout header */}
      <header className="bg-[rgba(249,249,249,0.95)] backdrop-blur-md border-b border-[rgba(192,202,184,0.3)] px-8 md:px-16 py-4 flex items-center justify-between sticky top-0 z-40">
        <Link href="/" className="flex-shrink-0">
          <Image
            src="/logo/Asset 16@5x.webp"
            alt="Fechi Organics"
            width={120}
            height={42}
            className="object-contain h-[30px] w-auto"
            priority
          />
        </Link>
        <div className="flex items-center gap-2 text-[#40493c]">
          <Icon icon="mdi:lock-outline" width={16} />
          <span className="font-body text-[14px]">Secure Checkout</span>
        </div>
      </header>

      <CartClient />

      {/* Minimal footer */}
      <footer className="bg-[#27731e] py-6 px-8 mt-auto">
        <p className="font-body text-[#a4f690] text-[14px] text-center">
          © 2026 Fechi Organics. All rights reserved.
        </p>
      </footer>

    </div>
  );
}
