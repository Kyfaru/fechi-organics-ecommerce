import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { combineLegacyPhone } from "@/lib/phone";
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

  // session.user doesn't carry phoneCode (not a Better Auth additionalField),
  // and phone/phoneCode are stored as separate DB columns — fetch and join
  // them into one E.164 value so the phone input shows the right country code.
  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { phoneCode: true },
  });
  const phone = user.phone ? combineLegacyPhone(user.phone, dbUser?.phoneCode ?? null) : null;

  return (
    <DeliveryClient
      user={{
        fullName:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.name ||
          "",
        email: user.email ?? "",
        phone: phone ?? "",
        country: user.country ?? "KE",
      }}
    />
  );
}
