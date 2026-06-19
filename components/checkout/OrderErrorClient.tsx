"use client";

import Link from "next/link";
import { Icon } from "@iconify/react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

type Order = {
  id: string;
  totalKes: number;
  customerName: string;
  location: string;
};

function shortId(id: string) {
  return `#FO-${id.slice(0, 8).toUpperCase()}`;
}

function formatKes(cents: number) {
  return `KSh ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

export function OrderErrorClient({ order }: { order: Order }) {
  return (
    <div className="min-h-screen bg-[#fbfbfa] dark:bg-gray-950">
      <Navbar />
      <main className="mx-auto flex min-h-[640px] max-w-[720px] flex-col items-center px-4 py-16 text-center md:py-24">
        <div className="flex h-22 w-22 items-center justify-center rounded-full border border-red-200 bg-red-50 shadow-[0_20px_60px_rgba(220,38,38,0.12)]">
          <Icon icon="mdi:close-bold" width={40} className="text-red-600" />
        </div>
        <h1 className="mt-8 font-heading text-[42px] font-black leading-tight text-[#1a1c1c] dark:text-white">Payment Not Completed</h1>
        <p className="mt-4 max-w-[520px] text-[18px] leading-8 text-[#40493c] dark:text-gray-300">
          Sorry, {order.customerName.split(" ")[0] || "there"}. Your order <span className="font-bold text-red-600">{shortId(order.id)}</span> was saved, but the payment was marked unsuccessful.
        </p>

        <div className="mt-10 w-full max-w-[575px] rounded-[14px] border border-[#c8d7c3] bg-white p-6 text-left shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#707a6b]">Order Number</p>
              <p className="mt-2 text-[16px] font-black text-[#1a1c1c] dark:text-white">{shortId(order.id)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#707a6b]">Amount</p>
              <p className="mt-2 text-[16px] font-black text-[#1a1c1c] dark:text-white">{formatKes(order.totalKes)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#707a6b]">Delivery Area</p>
              <p className="mt-2 line-clamp-2 text-[14px] font-black text-[#1a1c1c] dark:text-white">{order.location || "Not set"}</p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/payment" className="flex h-14 min-w-[184px] items-center justify-center rounded-full bg-[#fec700] px-8 text-[15px] font-black text-[#1a1c1c]">Try Again</Link>
          <Link href="/contact" className="flex h-14 min-w-[184px] items-center justify-center rounded-full border border-[#707a6b] px-8 text-[15px] font-black text-[#1a1c1c] dark:text-white">Contact Support</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
