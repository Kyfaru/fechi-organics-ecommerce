"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { posthog } from "@/lib/posthog";
import { WHATSAPP_URL, whatsappInNavbar } from "@/lib/whatsapp";

export function WhatsAppButton() {
  const pathname = usePathname();
  // NEXT_PUBLIC_WHATSAPP_BUTTON_POSITION=navbar (default) moves this into
  // Navbar.tsx / Home-Navbar.tsx instead — see NavbarWhatsAppButton.tsx.
  if (whatsappInNavbar) return null;
  // Admin has its own WhatsApp entry point in the header — see AdminHeader.tsx
  if (pathname?.startsWith("/admin")) return null;
  // Removed entirely from the account area per product decision
  if (pathname?.startsWith("/account")) return null;

  return (
    <>
      <style>{`
        @keyframes wa-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.5); }
          50%       { box-shadow: 0 0 0 14px rgba(37, 211, 102, 0); }
        }
        .wa-glow { animation: wa-glow 2.4s ease-in-out infinite; }
      `}</style>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        onClick={() => posthog.capture("whatsapp_button_clicked")}
        className="fixed bottom-5 right-5 z-50 w-[54px] h-[54px] rounded-full bg-[#25d366] flex items-center justify-center wa-glow hover:brightness-110 transition-[filter]"
      >
        <Icon icon="mdi:whatsapp" width={30} className="text-white" />
      </a>
    </>
  );
}
