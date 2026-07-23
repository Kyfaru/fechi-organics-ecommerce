"use client";

import { ErrorPageShell } from "@/components/errors/ErrorPageShell";
import { BloomingClockTimeout408 } from "@/components/errors/illustrations";
import { LeafBackground } from "@/components/ui/leaf-background";

export default function TimeoutPage() {
  return (
    <main className="relative min-h-screen">
      <LeafBackground />
      <ErrorPageShell
        code="408"
        metadataLabel="ERROR 408 · REQUEST TIMED OUT"
        heading="Nature Takes Its Time — So Did This Connection"
        description="We're having trouble reaching our servers. Like waiting for a seedling to sprout, some things take a moment — let's give it another try."
        primaryCta={{ label: "Retry Connection", onClick: () => window.location.reload() }}
        illustration={<BloomingClockTimeout408 />}
      />
    </main>
  );
}
