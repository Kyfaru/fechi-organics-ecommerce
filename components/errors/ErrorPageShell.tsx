import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErrorPageShellVariant = "default" | "danger";

export interface ErrorPageCta {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface ErrorPageShellProps {
  /** Oversized watermark numeral/label rendered behind the heading, e.g. "404". Ignored if `glyph` is passed. */
  code?: string;
  /** Custom node to use as the oversized background glyph instead of `code` (e.g. an icon). */
  glyph?: ReactNode;
  /** Uppercase metadata row above the heading, e.g. "ERROR 404 · FECHI STOREFRONT". */
  metadataLabel: string;
  heading: string;
  description: string;
  primaryCta: ErrorPageCta;
  secondaryCta?: ErrorPageCta;
  /** Illustration slot, rendered in the right-hand column on desktop. */
  illustration?: ReactNode;
  /** Tonal background: "default" leans green/mint, "danger" leans toward --danger-bg. */
  variant?: ErrorPageShellVariant;
  className?: string;
}

const variantBackground: Record<ErrorPageShellVariant, string> = {
  default:
    "bg-gradient-to-br from-mint-light/50 via-white to-white dark:from-[#132015] dark:via-[#0f1210] dark:to-[#0f1210]",
  danger:
    "bg-gradient-to-br from-[var(--danger-bg)]/70 via-white to-white dark:from-[#2a1414]/50 dark:via-[#0f1210] dark:to-[#0f1210]",
};

function renderCta(cta: ErrorPageCta, variant: "default" | "outline") {
  if (cta.href) {
    return (
      <Button asChild variant={variant} size="lg">
        <Link href={cta.href}>{cta.label}</Link>
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} size="lg" onClick={cta.onClick}>
      {cta.label}
    </Button>
  );
}

export function ErrorPageShell({
  code,
  glyph,
  metadataLabel,
  heading,
  description,
  primaryCta,
  secondaryCta,
  illustration,
  variant = "default",
  className,
}: ErrorPageShellProps) {
  const watermark = glyph ?? code;

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden",
        variantBackground[variant],
        className,
      )}
    >
      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 sm:px-10 md:py-24 lg:grid-cols-12 lg:gap-16 lg:px-12">
        {/* Content column — first in DOM for a11y/SEO, shown second on mobile so the illustration leads visually */}
        <div className="relative order-2 lg:order-1 lg:col-span-6">
          {watermark ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-8 left-0 select-none font-heading text-[6.5rem] font-bold leading-none text-primary-green opacity-10 sm:-top-12 sm:text-[8.5rem] lg:-top-16 lg:text-[10.5rem]"
            >
              {watermark}
            </span>
          ) : null}

          <div className="relative space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
              {metadataLabel}
            </p>
            <h1 className="font-heading text-3xl font-bold text-text-dark sm:text-4xl">
              {heading}
            </h1>
            <p className="max-w-md border-l-2 border-yellow-cta pl-4 font-body text-base leading-relaxed text-text-body">
              {description}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {renderCta(primaryCta, "default")}
              {secondaryCta ? renderCta(secondaryCta, "outline") : null}
            </div>
          </div>
        </div>

        {/* Illustration column — first on mobile, second (right) on desktop */}
        {illustration ? (
          <div className="order-1 flex items-center justify-center lg:order-2 lg:col-span-6 lg:justify-end">
            <div className="w-full max-w-sm lg:max-w-md">{illustration}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
