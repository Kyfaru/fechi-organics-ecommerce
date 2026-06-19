import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DeliveryClient } from "@/components/checkout/DeliveryClient";

export default async function DeliveryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const user = session.user as {
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    country?: string | null;
  };

  return (
    <DeliveryClient
      user={{
        fullName:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.name ||
          "",
        email: user.email ?? "",
        phone: user.phone ?? "",
        country: user.country ?? "KE",
      }}
    />
  );
}
