"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { StepIndicator } from "@/components/checkout/StepIndicator";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Delivery data shape saved by the delivery page to sessionStorage */
interface DeliveryData {
  fullName: string;
  phone: string;
  email: string;
  county: string;
  address: string;
  city: string;
  deliveryType: "PICKUP" | "DELIVERY";
  branchId: string | null;
  branchName: string | null;
}

type PaymentMethod = "mpesa" | "payhero" | null;

type CartResponse = {
  ok: boolean;
  data: {
    subtotalKes: number;
    itemCount: number;
    cartId: string;
    items: unknown[];
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a KES-cent amount as a readable KES string.
 * lib/currency.ts does not export a simple cents→KES helper (only formatPrice
 * which requires a live FX rate), so we define one inline here.
 */
function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
  })}`;
}

// Delivery fee constants (in cents)
const PICKUP_FEE = 13000; // KES 130
const DELIVERY_FEE = 35000; // KES 350

// Max polling attempts before timeout (40 × 3s = ~2 minutes)
const MAX_POLL_ATTEMPTS = 40;
// Show "cancel" button after 15 s of polling
const CANCEL_SHOW_DELAY_MS = 15_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaymentPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Delivery data hydrated from sessionStorage
  const [deliveryData, setDeliveryData] = useState<DeliveryData | null>(null);

  // Which payment method is expanded
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(null);

  // M-Pesa phone input (pre-filled from delivery data)
  const [mpesaPhone, setMpesaPhone] = useState("");

  // Loading state while initiating a payment
  const [isInitiating, setIsInitiating] = useState(false);

  // orderId being polled (non-null = STK push is in flight)
  const [pollingOrderId, setPollingOrderId] = useState<string | null>(null);

  // Show "cancel" button after the grace period
  const [showCancel, setShowCancel] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Cart data
  // ---------------------------------------------------------------------------
  const { data: cartData } = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: () => fetch("/api/cart").then((r) => r.json()),
    staleTime: 0,
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  // Hydrate delivery data from sessionStorage; redirect if missing
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fechi_delivery");
      if (!raw) {
        router.push("/delivery");
        return;
      }
      const data = JSON.parse(raw) as DeliveryData;
      setDeliveryData(data);
      setMpesaPhone(data.phone ?? "");
    } catch {
      router.push("/delivery");
    }
  }, [router]);

  // Auth guard — redirect unauthenticated users to login
  useEffect(() => {
    if (!isPending && !session) router.push("/login");
  }, [isPending, session, router]);

  // Cleanup polling and cancel timer on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const subtotal = cartData?.data?.subtotalKes ?? 0;
  const deliveryFee =
    deliveryData?.deliveryType === "PICKUP" ? PICKUP_FEE : DELIVERY_FEE;
  const total = subtotal + deliveryFee;

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
  }

  function startPolling(orderId: string) {
    setPollingOrderId(orderId);
    setShowCancel(false);
    let count = 0;

    // Show cancel button after grace period
    cancelTimerRef.current = setTimeout(
      () => setShowCancel(true),
      CANCEL_SHOW_DELAY_MS
    );

    pollIntervalRef.current = setInterval(async () => {
      count++;

      try {
        const res = await fetch(`/api/payments/status/${orderId}`);
        const data = await res.json();
        const status: string | undefined = data?.data?.paymentStatus;

        if (status === "PAID") {
          stopPolling();
          setPollingOrderId(null);
          toast.success("Payment successful! Your order is confirmed.");
          sessionStorage.removeItem("fechi_delivery");
          router.push("/orders");
          return;
        }

        if (status === "FAILED") {
          stopPolling();
          setPollingOrderId(null);
          toast.error("Payment failed. Please try again.");
          return;
        }
      } catch {
        // Network hiccup — keep polling silently
      }

      // Hard timeout after MAX_POLL_ATTEMPTS
      if (count >= MAX_POLL_ATTEMPTS) {
        stopPolling();
        setPollingOrderId(null);
        toast.error("Payment timed out. Please check your M-Pesa messages and try again.");
      }
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Payment handlers
  // ---------------------------------------------------------------------------

  async function handleMpesaPay() {
    if (!mpesaPhone.trim() || !deliveryData) return;
    setIsInitiating(true);
    try {
      const res = await fetch("/api/payments/mpesa/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mpesaPhone.trim(), deliveryData }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error ?? "Could not initiate M-Pesa payment.");
        return;
      }

      const orderId: string = data?.data?.orderId ?? data?.orderId;
      if (!orderId) {
        toast.error("Unexpected response from server. Please try again.");
        return;
      }

      startPolling(orderId);
    } catch {
      toast.error("Failed to initiate payment. Check your connection and try again.");
    } finally {
      setIsInitiating(false);
    }
  }

  async function handlePayheroPay() {
    if (!deliveryData) return;
    setIsInitiating(true);
    try {
      const res = await fetch("/api/payments/payhero/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryData }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error ?? "Could not initiate card payment.");
        return;
      }

      const checkoutUrl: string | undefined =
        data?.data?.checkoutUrl ?? data?.checkoutUrl;

      if (!checkoutUrl) {
        toast.error("No checkout URL received. Please try again.");
        return;
      }

      // Redirect to PayHero hosted checkout
      window.location.href = checkoutUrl;
    } catch {
      toast.error("Failed to initiate card payment. Check your connection and try again.");
    } finally {
      setIsInitiating(false);
    }
  }

  function handleCancelPolling() {
    stopPolling();
    setPollingOrderId(null);
    setShowCancel(false);
    toast.error("Payment cancelled. You can try again.");
  }

  // ---------------------------------------------------------------------------
  // Loading / guard state
  // ---------------------------------------------------------------------------

  if (isPending || !deliveryData) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <Icon
          icon="mdi:loading"
          width={32}
          className="animate-spin text-[#27731e]"
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#f9f9f9] dark:bg-gray-950">
      <Navbar />

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Step indicator — step 3 of 3 */}
        <div className="mb-8">
          <StepIndicator step={3} />
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Order summary card                                                  */}
        {/* ----------------------------------------------------------------- */}
        <div className="bg-white dark:bg-gray-900 rounded-[20px] border border-[#e2e2e2] dark:border-gray-700 p-5 mb-6">
          <h2 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[16px] mb-3">
            Order Summary
          </h2>

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#40493c] dark:text-gray-400">Subtotal</span>
              <span className="text-[#1a1c1c] dark:text-white">
                {formatKes(subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#40493c] dark:text-gray-400">
                {deliveryData.deliveryType === "PICKUP"
                  ? "Pickup Fee"
                  : "Delivery"}
              </span>
              <span className="text-[#1a1c1c] dark:text-white">
                {formatKes(deliveryFee)}
              </span>
            </div>

            <div className="h-px bg-[#e2e2e2] dark:bg-gray-700 my-1" />

            <div className="flex justify-between font-bold">
              <span className="text-[#1a1c1c] dark:text-white">Total</span>
              <span className="text-[#27731e] text-[18px]">
                {formatKes(total)}
              </span>
            </div>
          </div>

          {/* Delivery destination summary */}
          <div className="mt-3 pt-3 border-t border-[#e2e2e2] dark:border-gray-700">
            <p className="text-xs text-[#40493c] dark:text-gray-400">
              Delivering to:{" "}
              <strong className="text-[#1a1c1c] dark:text-white">
                {deliveryData.deliveryType === "PICKUP"
                  ? `Pickup — ${deliveryData.branchName ?? deliveryData.county}`
                  : `${deliveryData.city}, ${deliveryData.county}`}
              </strong>
            </p>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Payment method selection                                            */}
        {/* ----------------------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="font-heading font-bold text-[#1a1c1c] dark:text-white text-[22px] mb-4">
            Select Payment Method
          </h1>

          <div className="flex flex-col gap-4">
            {/* --------------------------------------------------------------- */}
            {/* M-Pesa card                                                       */}
            {/* --------------------------------------------------------------- */}
            <div
              role="button"
              aria-pressed={selectedMethod === "mpesa"}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  setSelectedMethod("mpesa");
              }}
              className={`bg-white dark:bg-gray-900 rounded-[20px] border-2 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#27731e] focus-visible:ring-offset-2 ${
                selectedMethod === "mpesa"
                  ? "border-[#27731e]"
                  : "border-[#e2e2e2] dark:border-gray-700"
              }`}
              onClick={() => setSelectedMethod("mpesa")}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 p-4">
                {/* M-Pesa icon — using a styled "M" badge since simple-icons:mpesa
                    is not in the @iconify/react icon set */}
                <div className="w-10 h-10 rounded-full bg-[#27731e] flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-extrabold text-[15px] leading-none">
                    M
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#1a1c1c] dark:text-white">
                    M-Pesa
                  </p>
                  <p className="text-xs text-[#40493c] dark:text-gray-400">
                    Pay via M-Pesa STK push
                  </p>
                </div>
                {/* Selection indicator */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedMethod === "mpesa"
                      ? "border-[#27731e] bg-[#27731e]"
                      : "border-[#c0cab8] dark:border-gray-600"
                  }`}
                >
                  {selectedMethod === "mpesa" && (
                    <Icon icon="mdi:check" width={12} className="text-white" />
                  )}
                </div>
              </div>

              {/* Expanded panel */}
              <AnimatePresence initial={false}>
                {selectedMethod === "mpesa" && (
                  <motion.div
                    key="mpesa-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4">
                      <div className="border-t border-[#e2e2e2] dark:border-gray-700 pt-4">
                        {pollingOrderId ? (
                          /* Waiting for STK confirmation */
                          <div className="flex flex-col items-center gap-3 py-2">
                            <div className="w-12 h-12 rounded-full bg-[#27731e]/10 flex items-center justify-center">
                              <Icon
                                icon="mdi:cellphone-message"
                                width={28}
                                className="text-[#27731e]"
                              />
                            </div>
                            <p className="text-sm font-semibold text-[#1a1c1c] dark:text-white text-center">
                              Check your phone for the M-Pesa prompt
                            </p>
                            <p className="text-xs text-[#40493c] dark:text-gray-400 text-center">
                              Enter your M-Pesa PIN to complete payment
                            </p>
                            <div className="flex items-center gap-2 text-xs text-[#40493c] dark:text-gray-400">
                              <Icon
                                icon="mdi:loading"
                                width={14}
                                className="animate-spin"
                              />
                              Waiting for confirmation…
                            </div>
                            {showCancel && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelPolling();
                                }}
                                className="text-xs text-red-500 hover:underline mt-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 rounded"
                              >
                                Cancel and try again
                              </button>
                            )}
                          </div>
                        ) : (
                          /* Phone input + pay button */
                          <>
                            <label
                              htmlFor="mpesa-phone"
                              className="block text-xs font-semibold text-[#40493c] dark:text-gray-300 mb-2"
                            >
                              M-Pesa Phone Number
                            </label>
                            <input
                              id="mpesa-phone"
                              type="tel"
                              value={mpesaPhone}
                              onChange={(e) => setMpesaPhone(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="e.g. 0712345678"
                              className="w-full px-3 py-2.5 rounded-[8px] border border-[#c0cab8] dark:border-gray-600 bg-white dark:bg-gray-800 text-[14px] text-[#1a1c1c] dark:text-white placeholder-[#c0cab8] dark:placeholder-gray-500 focus:outline-none focus:border-[#27731e] transition-colors mb-3"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMpesaPay();
                              }}
                              disabled={isInitiating || !mpesaPhone.trim()}
                              className="w-full py-3 rounded-full bg-[#27731e] text-white font-bold text-sm hover:bg-[#1d5916] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {isInitiating && (
                                <Icon
                                  icon="mdi:loading"
                                  width={16}
                                  className="animate-spin"
                                />
                              )}
                              Pay {formatKes(total)} via M-Pesa
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* --------------------------------------------------------------- */}
            {/* PayHero / Card payment card                                       */}
            {/* --------------------------------------------------------------- */}
            <div
              role="button"
              aria-pressed={selectedMethod === "payhero"}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  setSelectedMethod("payhero");
              }}
              className={`bg-white dark:bg-gray-900 rounded-[20px] border-2 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#27731e] focus-visible:ring-offset-2 ${
                selectedMethod === "payhero"
                  ? "border-[#27731e]"
                  : "border-[#e2e2e2] dark:border-gray-700"
              }`}
              onClick={() => setSelectedMethod("payhero")}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  {/* mdi:credit-card-outline is the safe fallback for card payments
                      since logos:visa / logos:mastercard may not be available */}
                  <Icon
                    icon="mdi:credit-card-outline"
                    width={22}
                    className="text-white"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#1a1c1c] dark:text-white">
                    Card Payment
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Card type badge row — mdi icons used as safe alternatives */}
                    <div className="flex items-center gap-1">
                      <Icon
                        icon="mdi:credit-card"
                        width={18}
                        className="text-blue-600 dark:text-blue-400"
                      />
                      <Icon
                        icon="mdi:credit-card-chip"
                        width={18}
                        className="text-orange-500"
                      />
                    </div>
                    <span className="text-xs text-[#40493c] dark:text-gray-400">
                      via PayHero
                    </span>
                  </div>
                </div>
                {/* Selection indicator */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedMethod === "payhero"
                      ? "border-[#27731e] bg-[#27731e]"
                      : "border-[#c0cab8] dark:border-gray-600"
                  }`}
                >
                  {selectedMethod === "payhero" && (
                    <Icon icon="mdi:check" width={12} className="text-white" />
                  )}
                </div>
              </div>

              {/* Expanded panel */}
              <AnimatePresence initial={false}>
                {selectedMethod === "payhero" && (
                  <motion.div
                    key="payhero-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4">
                      <div className="border-t border-[#e2e2e2] dark:border-gray-700 pt-4">
                        <p className="text-xs text-[#40493c] dark:text-gray-400 mb-3">
                          You will be redirected to PayHero&apos;s secure checkout
                          to complete your card payment.
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePayheroPay();
                          }}
                          disabled={isInitiating}
                          className="w-full py-3 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isInitiating && (
                            <Icon
                              icon="mdi:loading"
                              width={16}
                              className="animate-spin"
                            />
                          )}
                          Pay with Card — {formatKes(total)}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Back to delivery */}
          <button
            onClick={() => router.push("/delivery")}
            className="mt-6 flex items-center gap-1.5 text-sm text-[#40493c] dark:text-gray-400 hover:text-[#27731e] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27731e] rounded-sm"
          >
            <Icon icon="mdi:arrow-left" width={16} />
            Back to delivery
          </button>
        </motion.div>
      </div>
    </div>
  );
}
