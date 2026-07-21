import type { Metadata } from "next";
import { ErrorPageShell } from "@/components/errors/ErrorPageShell";
import { DisconnectedVineNetwork } from "@/components/errors/illustrations";
import { LeafBackground } from "@/components/ui/leaf-background";

export const metadata: Metadata = {
  title: "Connection Lost | Fechi Organics",
  description: "We can't reach the network right now — check your connection and try again.",
};

const HELP_CARDS = [
  {
    title: "Check Your Connection",
    body: "Make sure Wi-Fi or mobile data is on and you have a signal.",
  },
  {
    title: "Refresh the Page",
    body: "A quick reload clears up most temporary connection hiccups.",
  },
  {
    title: "Still Stuck? Contact Us",
    body: "If the problem sticks around, our team is happy to help.",
    href: "/contact",
  },
];

export default function NetworkIssuePage() {
  return (
    <main className="relative min-h-screen">
      <LeafBackground />
      <ErrorPageShell
        metadataLabel="OFFLINE · CONNECTION LOST"
        heading="The Signal's Gone Quiet"
        description="We're having trouble reaching the network. This is usually on your end — check your connection and try again."
        primaryCta={{ label: "Try Again", href: "/network-issue" }}
        illustration={<DisconnectedVineNetwork />}
      />
      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-6 pb-16 sm:px-10 sm:grid-cols-3 lg:px-12">
        {HELP_CARDS.map((card) => {
          const content = (
            <>
              <h2 className="font-heading text-sm font-semibold text-text-dark">{card.title}</h2>
              <p className="mt-2 font-body text-sm leading-relaxed text-text-body">{card.body}</p>
            </>
          );
          return card.href ? (
            <a
              key={card.title}
              href={card.href}
              className="rounded-lg bg-mint-light/60 p-5 transition-colors hover:bg-mint-light"
            >
              {content}
            </a>
          ) : (
            <div key={card.title} className="rounded-lg bg-mint-light/60 p-5">
              {content}
            </div>
          );
        })}
      </div>
    </main>
  );
}
