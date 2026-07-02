import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Syne, DM_Sans } from "next/font/google";
import { vastago, stagnan, realHead } from "@/lib/fonts";
import { Providers } from "./providers";
import { SessionProvider } from "@/components/providers/session-provider";
import { Toaster } from "sonner";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne-var", weight: ["600", "700"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-var", weight: ["400", "500", "600"] });

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
    <html
      lang="en"
      className={`h-full antialiased ${syne.variable} ${dmSans.variable} ${vastago.variable} ${stagnan.variable} ${realHead.variable}`}
    >
      <body className="min-h-full flex flex-col">
        {/* Suspense boundary so PPR can generate a static shell for the html/body
            without blocking on the CurrencyProvider's fetch-on-mount. */}
        <Suspense>
          <Providers>
            <SessionProvider>
              {children}
              <Toaster position="bottom-right" richColors />
              <WhatsAppButton />
            </SessionProvider>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
