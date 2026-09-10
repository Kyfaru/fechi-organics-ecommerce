"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { ErrorPageShell } from "@/components/errors/ErrorPageShell";
import { WiltedBottle500 } from "@/components/errors/illustrations";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="min-h-screen">
      <ErrorPageShell
        code="500"
        metadataLabel="ERROR 500 · SOMETHING BROKE"
        heading="Our Roots Are Untangling"
        description="We're experiencing a temporary disruption in our systems. Our team is working to restore connection to the digital soil — please bear with us while we prune this issue."
        primaryCta={{ label: "Refresh Page", onClick: reset }}
        secondaryCta={{ label: "Contact Support", href: "/contact" }}
        illustration={<WiltedBottle500 />}
        variant="danger"
      />
    </main>
  );
}
