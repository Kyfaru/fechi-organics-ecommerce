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
        heading="Something Wilted on Our End"
        description="An unexpected error stopped this page from loading. Try refreshing — if it keeps happening, let us know and we'll dig in."
        primaryCta={{ label: "Refresh Page", onClick: reset }}
        secondaryCta={{ label: "Contact Support", href: "/contact" }}
        illustration={<WiltedBottle500 />}
        variant="danger"
      />
    </main>
  );
}
