"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { Navbar } from "@/components/layout/Navbar";
import { toast } from "@/lib/toast";

type Order = {
  id: string;
  createdAt: string;
  totalKes: number;
  deliveryType: "PICKUP" | "DELIVERY";
  deliveryCounty: string | null;
  deliveryCity: string | null;
  deliveryZone: string | null;
  branchId: string | null;
  failureReason: string | null;
  items: { id: string; name: string; quantity: number; imageUrl: string | null }[];
};

type PaymentStatus = "PENDING" | "PAID" | "FAILED";

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function capture(event: string, props?: Record<string, unknown>) {
  const posthog = (window as unknown as { posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } }).posthog;
  posthog?.capture(event, props);
}

function errorMessage(reason: string | null) {
  const code = reason?.split(":")[0];
  if (code === "1032") return "Payment cancelled. Tap 'Try Again' to restart.";
  if (code === "1037") return "Request timed out - phone didn't respond. Try again.";
  if (code === "2001") return "Wrong M-Pesa PIN entered. Try again.";
  if (code === "1") return "Insufficient M-Pesa balance. Top up and try again, or switch payment method.";
  if (code?.startsWith("4")) return "Payment not completed. Try again or contact support.";
  if (code?.startsWith("5")) return "Payment service error. Please contact support.";
  return reason?.replace(/^\d+:/, "") || "Payment not completed. Try again or contact support.";
}

export function PaymentProcessingClient({ order, method }: { order: Order; method: "mpesa" | "payhero" }) {
  const router = useRouter();
  const pollCount = useRef(0);
  const [status, setStatus] = useState<PaymentStatus>("PENDING");
  const [failureReason, setFailureReason] = useState(order.failureReason);
  const [timedOut, setTimedOut] = useState(false);

  const maxPolls = method === "mpesa" ? 5 : 45;
  const location = order.deliveryType === "PICKUP"
    ? "Pickup from selected store"
    : [order.deliveryZone, order.deliveryCity, order.deliveryCounty].filter(Boolean).join(", ");

  useEffect(() => {
    capture("payment_processing_viewed", { orderId: order.id, method });
    toast.info("Waiting for payment confirmation...", { duration: method === "mpesa" ? 10000 : 90000 });

    const interval = window.setInterval(async () => {
      pollCount.current += 1;
      try {
        const res = await fetch(`/api/payments/status/${order.id}`);
        const json = await res.json();
        const nextStatus = json.data?.paymentStatus as PaymentStatus | undefined;
        setFailureReason(json.data?.failureReason ?? null);

        if (nextStatus === "PAID") {
          window.clearInterval(interval);
          capture("payment_success", { orderId: order.id, method });
          router.push(`/order-success/${order.id}`);
          return;
        }
        if (nextStatus === "FAILED") {
          window.clearInterval(interval);
          setStatus("FAILED");
          capture("payment_failed", { orderId: order.id, method });
          return;
        }
      } catch {
        // Keep polling through transient network errors.
      }

      if (pollCount.current >= maxPolls) {
        window.clearInterval(interval);
        setTimedOut(true);
        capture("payment_timeout", { orderId: order.id, method });
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [maxPolls, method, order.id, router]);

  const failed = status === "FAILED" || timedOut;
  const message = timedOut
    ? method === "mpesa"
      ? "Request timed out - phone didn't respond. Try again."
      : "Taking longer than expected. Check your email or contact support."
    : errorMessage(failureReason);

  const itemNames = useMemo(() => order.items.map((item) => item.name).join(", "), [order.items]);

  return (
    <div className="min-h-screen bg-[#f9f9f9] dark:bg-gray-950">
      <Navbar />
      <main className="max-w-xl mx-auto px-4 py-10">
        <div className="bg-white dark:bg-gray-900 border border-[#e2e2e2] dark:border-gray-700 rounded-[20px] p-6">
          {failed ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 mx-auto flex items-center justify-center mb-4">
                <Icon icon="mdi:alert-circle-outline" width={30} className="text-red-600" />
              </div>
              <h1 className="font-heading text-2xl font-bold text-[#1a1c1c] dark:text-white">ORDER #{shortId(order.id)}</h1>
              <p className="mt-2 text-sm text-[#40493c] dark:text-gray-400">
                {new Date(order.createdAt).toLocaleString("en-KE")} - {formatKes(order.totalKes)} - {location || "Delivery"}
              </p>
              <p className="mt-6 text-sm font-semibold text-red-600">{message}</p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button onClick={() => router.push("/payment")} className="flex-1 h-11 rounded-full bg-[#27731e] text-white text-sm font-bold">TRY AGAIN</button>
                <Link href="/contact" className="flex-1 h-11 rounded-full border border-[#c0cab8] text-sm font-bold flex items-center justify-center">CONTACT SUPPORT</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#27731e]">Order #{shortId(order.id)}</p>
                  <h1 className="mt-2 font-heading text-2xl font-bold text-[#1a1c1c] dark:text-white">Please complete your payment</h1>
                </div>
                <div className="flex -space-x-3">
                  {order.items.slice(0, 3).map((item) => (
                    <div key={item.id} className="w-12 h-12 rounded-full border-2 border-white bg-[#eef4eb] overflow-hidden flex items-center justify-center">
                      {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={48} height={48} className="w-full h-full object-cover" /> : <Icon icon="mdi:package-variant" width={20} className="text-[#27731e]" />}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 text-sm text-[#40493c] dark:text-gray-400">
                <p>{itemNames}</p>
                <p className="mt-1 font-bold text-[#1a1c1c] dark:text-white">{formatKes(order.totalKes)}</p>
                <p className="mt-1">Delivery: {location || "Delivery"} - Est. {order.deliveryType === "PICKUP" ? "same day" : "1-3 business days"}</p>
              </div>
              <div className="my-8 h-px bg-[#e2e2e2] dark:bg-gray-700" />
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-[#27731e]/10 mx-auto flex items-center justify-center">
                  <Icon icon={method === "mpesa" ? "mdi:cellphone-message" : "mdi:credit-card-clock-outline"} width={34} className="text-[#27731e] animate-pulse" />
                </div>
                <p className="mt-4 text-sm font-semibold text-[#1a1c1c] dark:text-white">
                  {method === "mpesa" ? "Enter your PIN on your phone" : "Complete payment in the PayHero interface"}
                </p>
                <Icon icon="mdi:loading" width={24} className="mt-5 mx-auto animate-spin text-[#27731e]" />
                <p className="mt-4 text-xs text-[#40493c] dark:text-gray-400">Do not go back or refresh this page</p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
