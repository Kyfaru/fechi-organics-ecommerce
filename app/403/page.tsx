import type { Metadata } from "next";
import { ErrorPageShell } from "@/components/errors/ErrorPageShell";
import { LockedGate403 } from "@/components/errors/illustrations";
import { LeafBackground } from "@/components/ui/leaf-background";

export const metadata: Metadata = {
  title: "Access Restricted | Fechi Organics",
  description: "This area is fenced off — you don't have permission to view it.",
};

export default function ForbiddenPage() {
  return (
    <main className="relative min-h-screen">
      <LeafBackground />
      <ErrorPageShell
        code="403"
        metadataLabel="ERROR 403 · ACCESS RESTRICTED"
        heading="The Garden Is Gated"
        description="It seems you don't have the key to access this part of our botanical sanctuary. This area is reserved for specific personnel or requires elevated permissions."
        primaryCta={{ label: "Contact Support", href: "/contact" }}
        secondaryCta={{ label: "Return to Safety", href: "/" }}
        illustration={<LockedGate403 />}
      />
    </main>
  );
}
