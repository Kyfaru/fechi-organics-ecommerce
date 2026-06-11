import { Suspense } from "react";
import LoginForm from "./LoginForm";

// LoginForm is a "use client" component that calls useSearchParams() inside its
// own Suspense boundary.  Wrapping it here gives PPR (cacheComponents) a static
// shell so the page can be prerendered without hitting the dynamic boundary.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
