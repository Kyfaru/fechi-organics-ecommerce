"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { Navbar } from "@/components/layout/Navbar";
import { toast } from "@/lib/toast";

interface DeliveryData {
  fullName: string;
  phone: string;
  email: string;
  country?: string;
  countryName?: string;
  county: string;
  state?: string;
  deliveryZone?: string | null;
  deliveryKes?: number;
  address?: string;
  city?: string;
  deliveryType: "PICKUP" | "DELIVERY";
  branchName: string | null;
  promoCode?: string | null;
}

type PaymentMethod = "mpesa" | "card" | "paypal" | "cod";
type CartItem = { productId: string; name: string; quantity: number; lineTotalKes: number; primaryImageUrl?: string };
type CartResponse = { ok: boolean; data: { items: CartItem[]; subtotalKes: number; itemCount: number } };
type DemoResult = { outcome: "success" | "failed"; method: PaymentMethod; phase: "deciding" | "saving" };

function formatKes(cents: number) {
  return `KSh ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function promoDiscountFor(subtotalKes: number, promoCode?: string | null) {
  if (promoCode === "FECHI10") return Math.round(subtotalKes * 0.1);
  if (promoCode === "NEWUSER") return 50000;
  return 0;
}

function capture(event: string, props?: Record<string, unknown>) {
  const posthog = (window as unknown as { posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } }).posthog;
  posthog?.capture(event, props);
}

export default function PaymentPage() {
  const router = useRouter();
  const [deliveryData, setDeliveryData] = useState<DeliveryData | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("mpesa");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);

  const cartQuery = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: () => fetch("/api/cart").then((r) => r.json()),
    staleTime: 0,
  });

  useEffect(() => {
    window.setTimeout(() => {
      const raw = sessionStorage.getItem("fechi_delivery");
      if (!raw) {
        router.push("/delivery");
        return;
      }
      const parsed = JSON.parse(raw) as DeliveryData;
      const promoCode = sessionStorage.getItem("fechi_promo");
      const data = { ...parsed, promoCode };
      setDeliveryData(data);
      setMpesaPhone(data.phone ?? "");
      capture("checkout_payment_viewed", { deliveryType: data.deliveryType, country: data.country });
    }, 0);
  }, [router]);

  const items = cartQuery.data?.data?.items ?? [];
  const subtotalKes = cartQuery.data?.data?.subtotalKes ?? 0;
  const deliveryKes = deliveryData?.deliveryKes ?? 0;
  const discountKes = promoDiscountFor(subtotalKes, deliveryData?.promoCode);
  const totalKes = subtotalKes + deliveryKes - discountKes;

  const deliveryLocation = useMemo(() => {
    if (!deliveryData) return "";
    if (deliveryData.deliveryType === "PICKUP") return deliveryData.branchName ?? "Selected pickup store";
    return [
      deliveryData.fullName,
      deliveryData.deliveryZone || deliveryData.address,
      deliveryData.city || deliveryData.state || deliveryData.county,
      deliveryData.countryName || deliveryData.country,
    ].filter(Boolean).join("\n");
  }, [deliveryData]);

  async function completeOrder(outcome: "success" | "failed" = "success") {
    if (!deliveryData) return;
    setSubmitting(true);
    setDemoResult((current) => current ? { ...current, phase: "saving" } : current);
    capture("payment_initiated", { method: selectedMethod, mocked: true, outcome });
    try {
      const res = await fetch("/api/payments/mock/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryData: { ...deliveryData, phone: selectedMethod === "mpesa" ? mpesaPhone : deliveryData.phone },
          paymentMethod: selectedMethod,
          outcome,
        }),
      });
      const json = await res.json();
      const orderId = json.data?.orderId as string | undefined;
      if (!res.ok || !orderId) {
        setDemoResult(null);
        toast.error(json.error?.message ?? "Could not complete order.");
        return;
      }
      router.push(outcome === "success" ? `/order-success/${orderId}` : `/order-error/${orderId}`);
    } catch {
      setDemoResult(null);
      toast.error("Could not complete order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function startDemoPayment() {
    if (selectedMethod === "mpesa" && !mpesaPhone.trim()) return;

    const outcome = selectedMethod === "mpesa" || selectedMethod === "card"
      ? Math.random() >= 0.5 ? "success" : "failed"
      : "success";

    setDemoResult({ outcome, method: selectedMethod, phase: "deciding" });
    window.setTimeout(() => {
      void completeOrder(outcome);
    }, 1200);
  }

  if (!deliveryData) {
    return (
      <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
        <Icon icon="mdi:loading" width={30} className="animate-spin text-[#27731e]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f8f7] dark:bg-gray-950">
      <Navbar />
      <main className="mx-auto max-w-[1180px] px-4 py-16 md:py-24">
        <h1 className="mb-20 text-center font-heading text-[34px] font-bold text-[#1a1c1c] dark:text-white">Complete Your Order</h1>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px]">
          <section className="rounded-[12px] border border-[#e1e8de] bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <Icon icon="mdi:wallet-outline" width={22} className="text-[#0b6b13]" />
              <div>
                <h2 className="font-heading text-[24px] font-bold text-[#1a1c1c] dark:text-white">Choose Payment Method</h2>
                <p className="mt-2 text-[13px] text-[#40493c] dark:text-gray-400">All transactions are secure and encrypted.</p>
              </div>
            </div>

            <div className="space-y-3">
              <PaymentOption active={selectedMethod === "mpesa"} onClick={() => setSelectedMethod("mpesa")} title="M-Pesa STK Push" badge="M-PESA">
                <p className="mb-4 text-[13px] text-[#40493c]">You will receive a prompt on your phone to complete the payment.</p>
                <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-[#40493c]">M-Pesa Phone Number</label>
                <input value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} className="h-12 w-full rounded-[8px] border border-[#c0cab8] bg-[#fbfbfb] px-4 text-[14px] outline-none focus:border-[#27731e]" />
              </PaymentOption>
              <PaymentOption active={selectedMethod === "card"} onClick={() => setSelectedMethod("card")} title="Credit / Debit Card" badge="VISA  MC" />
              <PaymentOption active={selectedMethod === "paypal"} onClick={() => setSelectedMethod("paypal")} title="PayPal" badge="PayPal" />
              <PaymentOption active={selectedMethod === "cod"} onClick={() => setSelectedMethod("cod")} title="Pay on Delivery" icon="mdi:truck-delivery-outline" />
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-8 text-[12px] font-bold uppercase tracking-[0.12em] text-[#707a6b]">
              <span className="flex items-center gap-2"><Icon icon="mdi:lock-outline" width={16} className="text-[#27731e]" /> SSL Secured</span>
              <span className="flex items-center gap-2"><Icon icon="mdi:shield-check-outline" width={16} className="text-[#27731e]" /> Encrypted</span>
              <span className="flex items-center gap-2"><Icon icon="mdi:message-outline" width={16} className="text-[#27731e]" /> 24/7 Support</span>
            </div>
          </section>

          <aside className="rounded-[12px] border border-[#e1e8de] bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:p-8">
            <h2 className="font-heading text-[24px] font-bold text-[#1a1c1c] dark:text-white">Order Summary</h2>
            <div className="my-5 h-px bg-[#e6ebe3]" />

            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.productId} className="flex items-center gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[8px] bg-[#eef4eb]">
                    {item.primaryImageUrl ? <Image src={item.primaryImageUrl} alt={item.name} fill className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-[#1a1c1c] dark:text-white">{item.name}</p>
                    <p className="text-[12px] text-[#40493c]">Qty: {item.quantity}</p>
                  </div>
                  <p className="text-[13px] font-bold text-[#1a1c1c] dark:text-white">{formatKes(item.lineTotalKes)}</p>
                </div>
              ))}
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="whitespace-pre-line text-[13px] leading-6 text-[#1a1c1c] dark:text-gray-100">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#707a6b]">Delivering To</p>
              <p className="font-bold">{deliveryLocation}</p>
              <p className="font-bold">{deliveryData.deliveryType === "PICKUP" ? "Free Pickup" : "Standard Delivery (2-3 Days)"}</p>
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="space-y-3 text-[14px] text-[#40493c]">
              <SummaryRow label="Subtotal" value={formatKes(subtotalKes)} />
              <SummaryRow label="Delivery" value={deliveryKes ? formatKes(deliveryKes) : "Free"} />
              {discountKes > 0 && <SummaryRow label={`Discount (${deliveryData.promoCode})`} value={`- ${formatKes(discountKes)}`} green />}
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="flex items-center justify-between">
              <span className="text-[21px] font-bold text-[#1a1c1c] dark:text-white">Total</span>
              <span className="text-[28px] font-black text-[#27731e]">{formatKes(totalKes)}</span>
            </div>

            <button
              onClick={startDemoPayment}
              disabled={submitting || (selectedMethod === "mpesa" && !mpesaPhone.trim())}
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#fec700] text-[18px] font-black text-[#1a1c1c] transition-colors hover:bg-[#f0b800] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon icon={submitting ? "mdi:loading" : "mdi:lock-outline"} width={22} className={submitting ? "animate-spin" : ""} />
              Complete Order
            </button>
            <p className="mt-4 text-center text-[11px] text-[#707a6b]">By completing this order, you agree to our Terms &amp; Conditions.</p>
            <Link href="/delivery" className="mt-4 block text-center text-[13px] font-bold text-[#27731e]">Back to delivery details</Link>
          </aside>
        </div>
      </main>

      {demoResult ? <DemoPaymentModal result={demoResult} /> : null}
    </div>
  );
}

function DemoPaymentModal({ result }: { result: DemoResult }) {
  const isSuccess = result.outcome === "success";
  const methodLabel = result.method === "mpesa" ? "M-Pesa" : result.method === "card" ? "Card" : "";
  const title = isSuccess ? "Demo payment successful" : "Demo payment failed";
  const message = result.phase === "deciding"
    ? `Testing ${methodLabel} payment result...`
    : isSuccess
      ? "Creating your confirmed order..."
      : "Saving the failed payment attempt...";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[16px] border border-[#e1e8de] bg-white p-8 text-center shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${isSuccess ? "bg-[#e7f6e4] text-[#27731e]" : "bg-[#fdeaea] text-[#b42318]"}`}>
          <Icon icon={isSuccess ? "mdi:check-bold" : "mdi:close-thick"} width={38} />
        </div>
        <h2 className="mt-6 font-heading text-[25px] font-black text-[#1a1c1c] dark:text-white">{title}</h2>
        <p className="mt-3 text-[14px] leading-6 text-[#40493c] dark:text-gray-300">{message}</p>
        <div className="mx-auto mt-6 h-8 w-8">
          <Icon icon="mdi:loading" width={32} className="animate-spin text-[#27731e]" />
        </div>
      </div>
    </div>
  );
}

function PaymentOption({ active, onClick, title, badge, icon, children }: {
  active: boolean;
  onClick: () => void;
  title: string;
  badge?: string;
  icon?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[10px] border p-4 text-left transition-colors ${active ? "border-[#0b6b13] bg-[#f6fbf5] ring-1 ring-[#0b6b13]" : "border-[#dce4d8] bg-white hover:border-[#a9b8a2]"}`}
    >
      <div className="flex items-center gap-3">
        <span className={`h-4 w-4 rounded-full border ${active ? "border-[#0b6b13] bg-blue-600 ring-2 ring-[#a4f690]" : "border-[#7b8975]"}`} />
        <span className="flex-1 text-[16px] font-bold text-[#1a1c1c]">{title}</span>
        {badge ? <span className="rounded-[4px] border border-[#dce4d8] px-2 py-1 text-[10px] font-black text-[#0b6b13]">{badge}</span> : null}
        {icon ? <Icon icon={icon} width={22} className="text-[#707a6b]" /> : null}
      </div>
      {active && children ? <div className="ml-8 mt-5">{children}</div> : null}
    </button>
  );
}

function SummaryRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${green ? "text-[#0b6b13]" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
