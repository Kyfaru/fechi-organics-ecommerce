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
        heading="This Path Hasn't Sprouted Yet"
        description="The page you're looking for doesn't exist, or it's been moved. Let's get you back to solid ground."
        primaryCta={{ label: "Return Home", href: "/" }}
        illustration={<Botanical404 />}
      />
    </main>
  );
}
