"use client";

import { useEffect } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { Icon } from "@iconify/react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { toast } from "@/lib/toast";

type Order = {
  id: string;
  orderNumber?: string | null;
  createdAt: string;
  totalKes: number;
  email: string;
  phone: string;
  customerName: string;
  location: string;
  items: string[];
};

function shortId(id: string) {
  return `#FO-${id.slice(0, 8).toUpperCase()}`;
}

function estimateDelivery(createdAt: string) {
  const start = new Date(createdAt);
  start.setDate(start.getDate() + 2);
  const end = new Date(createdAt);
  end.setDate(end.getDate() + 5);
  return `${start.toLocaleDateString("en-KE", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-KE", { month: "short", day: "numeric" })}`;
}

function capture(event: string, props?: Record<string, unknown>) {
  const posthog = (window as unknown as { posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } }).posthog;
  posthog?.capture(event, props);
}

export function OrderSuccessClient({ order }: { order: Order }) {
  useEffect(() => {
    sessionStorage.removeItem("fechi_delivery");
    sessionStorage.removeItem("fechi_pending_order");
    sessionStorage.removeItem("fechi_promo");
    capture("order_success_viewed", { orderId: order.id });

    const burst = () => confetti({ particleCount: 120, spread: 80, colors: ["#27731e", "#fec700", "#a4f690"], origin: { y: 0.42 } });
    burst();
    const timers = [window.setTimeout(burst, 3000), window.setTimeout(burst, 6000)];

    // Sequential: queue receipt email first, then send inbox + SMS
    fetch(`/api/orders/${order.id}/receipt`, { method: "POST" })
      .then(() => capture("receipt_queued", { orderId: order.id }))
      .then(() => fetch(`/api/orders/${order.id}/notify`, { method: "POST" }))
      .then((r) => r.json() as Promise<{ inboxOk: boolean; smsOk: boolean }>)
      .then(({ inboxOk, smsOk }) => {
        if (!inboxOk && !smsOk) {
          toast.error("Could not send order confirmation. Please check your inbox later.");
        }
      })
      .catch(() => undefined);

    return () => timers.forEach(window.clearTimeout);
  }, [order.id]);

  return (
    <div className="min-h-screen bg-[#fbfbfa] dark:bg-gray-950">
      <Navbar />
      <main className="mx-auto flex min-h-[690px] max-w-[760px] flex-col items-center px-4 py-16 text-center md:py-24">
        <div className="flex h-22 w-22 items-center justify-center rounded-full border border-[#b9ddb7] bg-[#e6f4e5] shadow-[0_20px_60px_rgba(39,115,30,0.16)]">
          <Icon icon="mdi:check-bold" width={42} className="text-[#27731e]" />
        </div>
        <h1 className="mt-8 font-heading text-[46px] font-black leading-tight text-[#1a1c1c] dark:text-white">Order Confirmed!</h1>
        <p className="mt-4 max-w-[520px] text-[20px] leading-8 text-[#40493c] dark:text-gray-300">
          Thank you, {order.customerName.split(" ")[0] || "there"}! Your order <span className="font-bold text-[#0b6b13]">{order.orderNumber ?? shortId(order.id)}</span> has been placed. You will receive an email and text message confirmation shortly.
        </p>

        <div className="mt-12 grid w-full max-w-[575px] gap-6 rounded-[14px] border border-[#c8d7c3] bg-white p-6 text-left shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#707a6b]">Order Number</p>
            <p className="mt-2 text-[16px] font-black text-[#1a1c1c] dark:text-white">{order.orderNumber ?? shortId(order.id)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#707a6b]">Est. Delivery</p>
            <p className="mt-2 text-[16px] font-black text-[#1a1c1c] dark:text-white">{estimateDelivery(order.createdAt)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#707a6b]">Delivery Area</p>
            <p className="mt-2 line-clamp-2 text-[14px] font-black text-[#1a1c1c] dark:text-white">{order.location}</p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Link href={`/account/orders/${order.id}`} className="flex h-14 min-w-[184px] items-center justify-center rounded-full bg-[#fec700] px-8 text-[15px] font-black text-[#1a1c1c]">Track My Order</Link>
          <Link href="/shop" className="flex h-14 min-w-[216px] items-center justify-center rounded-full border border-[#707a6b] px-8 text-[15px] font-black text-[#1a1c1c] dark:text-white">Continue Shopping</Link>
        </div>

        <div className="mt-12 inline-flex items-center gap-2 rounded-full bg-[#f1f1f1] px-4 py-2 text-[13px] text-[#40493c]">
          <Icon icon="mdi:message-text-outline" width={16} className="text-[#27731e]" />
          We&apos;ll message you soon
        </div>
      </main>
      <Footer />
    </div>
  );
}
