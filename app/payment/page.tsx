"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { Navbar } from "@/components/layout/Navbar";
import { toast } from "@/lib/toast";
import { usePaymentStream } from "@/hooks/use-payment-stream";
import { useCurrency } from "@/app/providers";

const PAYSTACK_ERROR_MESSAGES: Record<string, string> = {
  payment_failed: "Payment was not completed. Please try again.",
  missing_reference: "Payment reference missing. Please try again.",
  not_found: "Payment record not found. Please try again.",
  forbidden: "Payment access denied. Please try again.",
  verify_failed: "Could not verify payment. Please try again.",
};

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

type PaymentMethod = "mpesa" | "card";
type CartItem = { productId: string; name: string; quantity: number; lineTotalKes: number; primaryImageUrl?: string };
type CartResponse = { ok: boolean; data: { items: CartItem[]; subtotalKes: number; itemCount: number } };

function capture(event: string, props?: Record<string, unknown>) {
  const posthog = (window as unknown as { posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } }).posthog;
  posthog?.capture(event, props);
}

export default function PaymentPage() {
  const router = useRouter();
  const { format } = useCurrency();
  const searchParams = useSearchParams();
  const [deliveryData, setDeliveryData] = useState<DeliveryData | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("mpesa");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [promoDiscountKes, setPromoDiscountKes] = useState(0);
  const [freeShipping, setFreeShipping] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState(0);

  // Paystack redirects back with ?error= on failure — show banner immediately
  const paystackError = searchParams.get("error");
  const paystackErrorMessage = paystackError ? (PAYSTACK_ERROR_MESSAGES[paystackError] ?? "Payment failed. Please try again.") : null;

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
      const promoAmountRaw = sessionStorage.getItem("fechi_promo_amount");
      const promoAmount = promoAmountRaw ? parseInt(promoAmountRaw, 10) : 0;
      const freeShippingFlag = sessionStorage.getItem("fechi_promo_free_shipping") === "1";
      const data = { ...parsed, promoCode };
      setDeliveryData(data);
      setPromoDiscountKes(promoAmount);
      setFreeShipping(freeShippingFlag);
      setMpesaPhone(data.phone ?? "");
      capture("checkout_payment_viewed", { deliveryType: data.deliveryType, country: data.country });
    }, 0);
  }, [router]);

  const items = cartQuery.data?.data?.items ?? [];
  const subtotalKes = cartQuery.data?.data?.subtotalKes ?? 0;
  const deliveryKes = freeShipping ? 0 : (deliveryData?.deliveryKes ?? 0);
  const discountKes = promoDiscountKes;
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

  async function handleMpesaPay() {
    if (!deliveryData || !mpesaPhone.trim()) return;
    setSubmitting(true);
    capture("payment_initiated", { method: "mpesa" });
    try {
      const res = await fetch("/api/payments/mpesa/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: mpesaPhone,
          deliveryData,
        }),
      });
      const json = await res.json() as { ok: boolean; data?: { orderId: string }; error?: { message: string } };
      if (!res.ok || !json.data?.orderId) {
        toast.error(json.error?.message ?? "Could not initiate payment. Please try again.");
        return;
      }
      setActiveOrderId(json.data.orderId);
      setShowModal(true);
    } catch {
      toast.error("Could not initiate payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCardPay() {
    if (!deliveryData) return;
    setSubmitting(true);
    capture("payment_initiated", { method: "card" });
    try {
      const res = await fetch("/api/payments/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryData }),
      });
      const json = await res.json() as { ok: boolean; data?: { authorization_url: string; reference: string; orderId: string }; error?: { message: string } };
      if (!res.ok || !json.data?.authorization_url) {
        toast.error(json.error?.message ?? "Could not start card payment. Please try again.");
        return;
      }
      window.location.href = json.data.authorization_url;
    } catch {
      toast.error("Could not start card payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
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

        {paystackErrorMessage ? (
          <div className="mb-8 flex items-start gap-3 rounded-[10px] border border-red-200 bg-red-50 px-5 py-4 text-[14px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            <Icon icon="mdi:alert-circle-outline" width={20} className="mt-0.5 shrink-0" />
            <span>{paystackErrorMessage}</span>
          </div>
        ) : null}

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
                <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-[#40493c]">Enter Your M-Pesa Phone Number</label>
                <input value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} className="h-12 w-full rounded-[8px] border border-[#c0cab8] bg-[#fbfbfb] px-4 text-[14px] text-text-dark dark:text-gray-200 outline-none focus:border-[#27731e]" />
              </PaymentOption>
              <PaymentOption active={selectedMethod === "card"} onClick={() => setSelectedMethod("card")} title="Credit / Debit Card" badge="VISA  MC" />
              
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
                  <p className="text-[13px] font-bold text-[#1a1c1c] dark:text-white">{format(item.lineTotalKes)}</p>
                </div>
              ))}
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="whitespace-pre-line text-[13px] leading-6 text-[#1a1c1c] dark:text-gray-100">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#707a6b]">Delivering To</p>
              <p className="font-bold">{deliveryLocation}</p>
              <p className="font-bold">{deliveryData.deliveryType === "PICKUP" ? "Free Pickup" : "Standard Delivery (1-2 Days)"}</p>
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="space-y-3 text-[14px] text-[#40493c]">
              <SummaryRow label="Subtotal" value={format(subtotalKes)} />
              <SummaryRow label="Delivery" value={deliveryKes ? format(deliveryKes) : "Free"} />
              {promoDiscountKes > 0 && <SummaryRow label={`Discount (${deliveryData.promoCode})`} value={`- ${format(promoDiscountKes)}`} green />}
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="flex items-center justify-between">
              <span className="text-[21px] font-bold text-[#1a1c1c] dark:text-white">Total</span>
              <span className="text-[28px] font-black text-[#27731e]">{format(totalKes)}</span>
            </div>

            <button
              onClick={selectedMethod === "mpesa" ? handleMpesaPay : handleCardPay}
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

      {showModal && activeOrderId ? (
        <PaymentStatusModal
          orderId={activeOrderId}
          onClose={(wasFailure) => {
            setShowModal(false);
            setActiveOrderId(null);
            if (wasFailure) {
              const next = failureCount + 1;
              setFailureCount(next);
              if (next >= 5) {
                toast.error("Too many failed attempts. Please try again later or contact support.");
                router.push("/cart");
              }
            }
          }}
        />
      ) : null}
    </div>
  );
}

function errorMessage(reason: string | null) {
  const code = reason?.split(":")[0];
  if (code === "1032") return "Payment cancelled. Tap 'Try Again' to restart.";
  if (code === "1037") return "Request timed out,phone didn't respond. Try again.";
  if (code === "2001") return "Wrong M-Pesa PIN entered. Try again.";
  if (code === "1") return "Insufficient M-Pesa balance. Top up and try again, or switch payment method.";
  if (code?.startsWith("4")) return "Payment not completed. Try again or contact support.";
  if (code?.startsWith("5")) return "Payment service error. Please contact support.";
  return reason?.replace(/^\d+:/, "") || "Payment not completed. Try again or contact support.";
}

function PaymentStatusModal({ orderId, onClose }: { orderId: string; onClose: (wasFailure?: boolean) => void }) {
  const router = useRouter();
  const { status, reason } = usePaymentStream(orderId);

  const phase =
    status === "success" ? "success" :
    status === "failed"  ? "failed"  :
    status === "timeout" ? "timeout" :
    "waiting";

  useEffect(() => {
    if (status === "success") {
      window.setTimeout(() => router.push(`/order-success/${orderId}`), 1500);
    }
  }, [status, orderId, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[16px] border border-[#e1e8de] bg-white p-8 text-center shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {phase === "waiting" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e7f6e4] text-[#27731e]">
              <Icon icon="mdi:cellphone-message" width={38} />
            </div>
            <h2 className="mt-6 font-heading text-[25px] font-black text-[#1a1c1c] dark:text-white">Waiting for payment...</h2>
            <p className="mt-3 text-[14px] leading-6 text-[#40493c] dark:text-gray-300">Check your phone and enter your M-Pesa PIN to complete the payment.</p>
            <div className="mx-auto mt-6 h-8 w-8"><Icon icon="mdi:loading" width={32} className="animate-spin text-[#27731e]" /></div>
          </>
        )}
        {phase === "success" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e7f6e4] text-[#27731e]">
              <Icon icon="mdi:check-bold" width={38} />
            </div>
            <h2 className="mt-6 font-heading text-[25px] font-black text-[#1a1c1c] dark:text-white">Payment successful!</h2>
            <p className="mt-3 text-[14px] leading-6 text-[#40493c] dark:text-gray-300">Redirecting to your order...</p>
            <div className="mx-auto mt-6 h-8 w-8"><Icon icon="mdi:loading" width={32} className="animate-spin text-[#27731e]" /></div>
          </>
        )}
        {phase === "failed" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#fdeaea] text-[#b42318]">
              <Icon icon="mdi:close-thick" width={38} />
            </div>
            <h2 className="mt-6 font-heading text-[25px] font-black text-[#1a1c1c] dark:text-white">Payment failed</h2>
            <p className="mt-3 text-[14px] leading-6 text-[#40493c] dark:text-gray-300">{errorMessage(reason ?? null)}</p>
            <button onClick={() => onClose(true)} className="mt-6 h-12 w-full rounded-full bg-[#fec700] text-[14px] font-black text-[#1a1c1c] transition-colors hover:bg-[#f0b800]">Try Again</button>
          </>
        )}
        {phase === "timeout" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#fff8e1] text-[#f59e0b]">
              <Icon icon="mdi:clock-alert-outline" width={38} />
            </div>
            <h2 className="mt-6 font-heading text-[25px] font-black text-[#1a1c1c] dark:text-white">Payment timed out</h2>
            <p className="mt-3 text-[14px] leading-6 text-[#40493c] dark:text-gray-300">Please check your M-Pesa and try again if you were charged.</p>
            <button onClick={() => onClose(true)} className="mt-6 h-12 w-full rounded-full bg-[#fec700] text-[14px] font-black text-[#1a1c1c] transition-colors hover:bg-[#f0b800]">Try Again</button>
          </>
        )}
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
        <span className={`h-3 w-3 rounded-full border ${active ? "border-[#0b6b13] bg-orange-300 ring-2 ring-[#a4f690]" : "border-[#7b8975]"}`} />
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
