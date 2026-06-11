import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";

export const metadata: Metadata = {
  title: "Fechi Organics",
  description: "Pure ingredients. Your Signature . Your health.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* Suspense boundary so PPR can generate a static shell for the html/body
            without blocking on the CurrencyProvider's fetch-on-mount. */}
        <Suspense>
          <Providers>
            {children}
            <Toaster position="bottom-right" richColors />
            <WhatsAppButton />
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
