import { Suspense } from "react";
import WelcomeTransition from "@/components/admin/login/WelcomeTransition";

export const metadata = { title: "Welcome | Fechi Organics Admin" };

// Deliberately NOT under app/admin/(protected)/ — that layout's AdminGuard
// re-checks the session/role/permissions server-side (Suspense-gated) on
// every navigation, which showed a visible spinner/blank gap before this
// page's content ever appeared, and occasionally lost the race against the
// session cookie Better Auth had just minted moments earlier (verifyOtp/
// verifyTotp), bouncing back to /admin/login instead of showing this page.
// Security is unaffected: proxy.ts's session-cookie check already gates
// every /admin/* path including this one, and the sensitive data stays
// behind the already role-gated API routes regardless of which layout
// wraps the page shell — see WelcomeTransition.tsx's header comment.
export default function AdminWelcomePage() {
  return (
    // WelcomeTransition reads ?t= (the one-time token) via useSearchParams
    // — that hook requires a Suspense boundary in the App Router.
    <Suspense fallback={null}>
      <WelcomeTransition />
    </Suspense>
  );
}
