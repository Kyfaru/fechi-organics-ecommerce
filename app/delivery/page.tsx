import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { combineLegacyPhone } from "@/lib/phone";
import { isBranchLimitedDelivery } from "@/lib/delivery-mode";
import { DeliveryClient } from "@/components/checkout/DeliveryClient";

// This page is guest-checkout capable — see proxy.ts's PUBLIC_PATHS and the
// guest branching in app/api/payments/*/route.ts. A logged-in visitor still
// gets their saved details prefilled; a guest gets a blank form and fills in
// name/email/phone themselves.
export default async function DeliveryPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  const sessionUser = session?.user as
    | {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        country?: string | null;
      }
    | undefined;

  // session.user doesn't carry phoneCode (not a Better Auth additionalField),
  // and phone/phoneCode are stored as separate DB columns — fetch and join
  // them into one E.164 value so the phone input shows the right country code.
  const dbUser = sessionUser
    ? await db.user.findUnique({ where: { id: sessionUser.id }, select: { phoneCode: true } })
    : null;
  const phone = sessionUser?.phone ? combineLegacyPhone(sessionUser.phone, dbUser?.phoneCode ?? null) : null;

  return (
    <DeliveryClient
      user={{
        fullName: sessionUser
          ? [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(" ") || sessionUser.name || ""
          : "",
        email: sessionUser?.email ?? "",
        phone: phone ?? "",
        country: sessionUser?.country ?? "KE",
      }}
      branchLimited={isBranchLimitedDelivery()}
    />
  );
}
