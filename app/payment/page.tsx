import { redirect } from "next/navigation";

// /delivery and /payment were merged into one checkout step (see
// components/checkout/DeliveryClient.tsx) — this route stays only so an old
// bookmark/link still lands somewhere useful instead of 404ing.
//
// app/api/payments/paystack/verify/route.ts still redirects failures here as
// "/payment?error=<code>" — forward that through so the merged checkout page
// can still show the failure banner instead of silently dropping it.
export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  redirect(error ? `/delivery?error=${encodeURIComponent(error)}` : "/delivery");
}
