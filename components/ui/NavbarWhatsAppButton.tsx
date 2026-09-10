"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { posthog } from "@/lib/posthog";
import { WHATSAPP_URL, whatsappInNavbar } from "@/lib/whatsapp";

/**
 * WhatsApp entry point shown inside Navbar.tsx / Home-Navbar.tsx (desktop
 * and mobile bars) when NEXT_PUBLIC_WHATSAPP_BUTTON_POSITION is unset or
 * "navbar" — see lib/whatsapp.ts and WhatsAppButton.tsx for the "floating"
 * alternative it replaces.
 */
export function NavbarWhatsAppButton({
  variant = "desktop",
  transparent = false,
}: {
  variant?: "desktop" | "mobile";
  transparent?: boolean;
}) {
  const pathname = usePathname();
  if (!whatsappInNavbar) return null;
  // Removed entirely from the account area per product decision — mirrors
  // the floating button's own exclusion.
  if (pathname?.startsWith("/account")) return null;

  const handleClick = () => posthog.capture("whatsapp_button_clicked", { source: `navbar_${variant}` });

  if (variant === "mobile") {
    return (
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        onClick={handleClick}
        className="relative p-2"
      >
        <Icon icon="mdi:whatsapp" width={22} className="text-[#25d366]" />
      </a>
    );
  }

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      onClick={handleClick}
      className={[
        "w-9 h-9 flex items-center justify-center rounded-full transition-colors",
        transparent ? "hover:bg-white/20" : "hover:bg-gray-100 dark:hover:bg-gray-800",
      ].join(" ")}
    >
      <Icon icon="mdi:whatsapp" width={22} className="text-[#25d366]" />
    </a>
  );
}
