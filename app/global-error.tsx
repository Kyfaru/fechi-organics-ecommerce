"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";
import { ErrorPageShell } from "@/components/errors/ErrorPageShell";
import { WiltedBottle500 } from "@/components/errors/illustrations";

export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-screen bg-white antialiased">
        <ErrorPageShell
          code="500"
          metadataLabel="ERROR 500 · SOMETHING BROKE"
          heading="The Whole Page Hit a Snag"
          description="Something went badly wrong and the page couldn't recover on its own. Reloading usually fixes it."
          primaryCta={{ label: "Reload Page", onClick: reset }}
          secondaryCta={{ label: "Contact Support", href: "/contact" }}
          illustration={<WiltedBottle500 />}
          variant="danger"
        />
      </body>
    </html>
  );
}
