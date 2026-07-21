import type { Metadata } from "next";
import { ErrorPageShell } from "@/components/errors/ErrorPageShell";
import { SproutingSeedComingSoon } from "@/components/errors/illustrations";
import { LeafBackground } from "@/components/ui/leaf-background";

export const metadata: Metadata = {
  title: "Coming Soon | Fechi Organics",
  description: "This feature is still growing — check back soon.",
};

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string; from?: string }>;
}) {
  const { feature } = await searchParams;
  const heading = feature ? `${feature} Is Coming Soon` : "Something's Sprouting";

  return (
    <main className="relative min-h-screen">
      <LeafBackground />
      <ErrorPageShell
        metadataLabel="COMING SOON · FECHI STOREFRONT"
        heading={heading}
        description="We're still tending to this one. Check back soon, or head back home in the meantime."
        primaryCta={{ label: "Notify Me", href: "mailto:hello@fechiorganics.com" }}
        secondaryCta={{ label: "Return Home", href: "/" }}
        illustration={<SproutingSeedComingSoon />}
      />
    </main>
  );
}
