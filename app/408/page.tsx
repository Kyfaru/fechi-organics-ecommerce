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
        heading="A Brief Pause in the Garden"
        description="Your request took too long to come back. This is usually temporary — give it another try."
        primaryCta={{ label: "Retry Connection", onClick: () => window.location.reload() }}
        illustration={<BloomingClockTimeout408 />}
      />
    </main>
  );
}
