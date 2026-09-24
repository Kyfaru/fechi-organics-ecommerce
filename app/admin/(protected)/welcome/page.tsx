import { Suspense } from "react";
import WelcomeTransition from "@/components/admin/login/WelcomeTransition";

export const metadata = { title: "Welcome | Fechi Organics Admin" };

export default function AdminWelcomePage() {
  return (
    // WelcomeTransition reads ?t= (the one-time token) via useSearchParams
    // — that hook requires a Suspense boundary in the App Router.
    <Suspense fallback={null}>
      <WelcomeTransition />
    </Suspense>
  );
}
