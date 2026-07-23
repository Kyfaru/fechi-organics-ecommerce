import type { Metadata } from "next";
import { ErrorPageShell } from "@/components/errors/ErrorPageShell";
import { Botanical404 } from "@/components/errors/illustrations";
import { LeafBackground } from "@/components/ui/leaf-background";

export const metadata: Metadata = {
  title: "Page Not Found | Fechi Organics",
  description: "The page you're looking for hasn't sprouted yet.",
};

export default function NotFound() {
  return (
    <main className="relative min-h-screen">
      <LeafBackground />
      <ErrorPageShell
        code="404"
        metadataLabel="ERROR 404 · FECHI STOREFRONT"
        heading="We've Strayed From the Path"
        description="The page or product you're looking for has been uprooted or doesn't exist. Let's help you find your way back to nature's best."
        primaryCta={{ label: "Return Home", href: "/" }}
        illustration={<Botanical404 />}
      />
    </main>
  );
}
