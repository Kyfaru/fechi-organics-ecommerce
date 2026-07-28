import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { DEV_ACCESS_COOKIE } from "@/lib/dev-access";
import { DevAccessToggle } from "@/components/dev/DevAccessToggle";

// Not linked from any nav — reachable only by knowing DEV_ACCESS_SECRET.
// A wrong/missing key 404s, indistinguishable from a route that doesn't
// exist. See app/api/dev/access/route.ts for what the toggle actually does.
export default async function DevAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const secret = process.env.DEV_ACCESS_SECRET;
  if (!secret || key !== secret) notFound();

  const enabled = (await cookies()).get(DEV_ACCESS_COOKIE)?.value === secret;

  return (
    <main className="min-h-screen flex items-center justify-center">
      <DevAccessToggle secretKey={key} initialEnabled={enabled} />
    </main>
  );
}
