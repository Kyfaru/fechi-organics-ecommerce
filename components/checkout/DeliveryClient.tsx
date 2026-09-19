"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import type { Value as PhoneValue } from "react-phone-number-input";
import { Navbar } from "@/components/layout/Navbar";
import { StepIndicator } from "@/components/checkout/StepIndicator";
import PointsRedeemInput from "@/components/checkout/PointsRedeemInput";
import PhoneInput from "@/components/ui/PhoneInput";
import { KENYA_COUNTIES } from "@/lib/kenya-counties";
import { toast } from "@/lib/toast";
import { useCurrency } from "@/app/providers";
import { CHECKOUT_FLOW_FLAG_KEY } from "@/lib/checkout-flow";
import { usePaymentStream } from "@/hooks/use-payment-stream";
import { useDeviceSignal } from "@/hooks/use-device-signal";

type DeliveryMode = "DELIVERY" | "PICKUP";
type PaymentMethod = "mpesa" | "card";
type Country = { code: string; name: string; flag: string; aliases?: string[] };
type Zone = { id: string; name: string; deliveryFeeKes: number; branchId: string | null };
type Branch = { id: string; cardEligible: boolean };
type StateOption = { code: string; name: string };
type CartItem = { productId: string; name: string; quantity: number; lineTotalKes: number; primaryImageUrl?: string };
type CartResponse = { ok: boolean; data: { items: CartItem[]; subtotalKes: number; itemCount: number } };
type SelectOption = { value: string; label: string; icon?: string; aliases?: string[] };

// Accent/case-insensitive: "turkiye" finds Türkiye.
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
// True if every char of `q` appears in `s` in order — typo tolerance ("sychelles" → Seychelles).
const isSubsequence = (q: string, s: string) => {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
};

type Props = {
  user: { fullName: string; email: string; phone: string; country: string };
  /** True only for a real session — `user` above is always a truthy object
   * (empty strings for a guest), so this is what actually distinguishes the
   * two rather than checking a field a guest is about to type into anyway. */
  isLoggedIn: boolean;
  /** See lib/delivery-mode.ts — swaps the Kenya County step for a Branch step when true. */
  branchLimited: boolean;
};

const MODE_COPY: Record<DeliveryMode, { heading: string; description: string; icon: string }> = {
  DELIVERY: {
    heading: "Home Delivery Details",
    description: "We'll bring your order straight to your location.",
    icon: "mdi:truck-delivery-outline",
  },
  PICKUP: {
    heading: "Store Pickup Details",
    description: "Collect your order from one of our store locations.",
    icon: "mdi:store-outline",
  },
};

const PICKUP_STORES = [
  { id: "pickup-nairobi",   branchId: "branch-nairobi",   city: "Nairobi",     county: "Nairobi",      name: "Nairobi — Spur Mall, 1st Floor, Shop F12" },
  { id: "pickup-nakuru",    branchId: "branch-nakuru",    city: "Nakuru",      county: "Nakuru",       name: "Nakuru — Baraka Plaza, 1st Floor, Shop F2" },
  { id: "pickup-kitengela", branchId: "branch-kitengela", city: "Kitengela",   county: "Kajiado",      name: "Kitengela — Next to Eastmart, 2nd Floor, Shop 63" },
  { id: "pickup-eldoret",   branchId: "branch-eldoret",   city: "Eldoret",     county: "Uasin Gishu",  name: "Eldoret — Eldo Center, 1st Floor, Shop 6" },
  { id: "pickup-mwea",      branchId: "branch-mwea",      city: "Mwea",        county: "Kirinyaga",    name: "Mwea — MTC Building, Opp. Nice City, 1st Floor" },
] as const;

// The 5 locations delivery is currently limited to (see lib/delivery-mode.ts)
// while real per-branch Daraja/KCB credentials only exist for Nairobi and
// Nakuru. Maps each to the county its DeliveryZone rows are already keyed by,
// so the existing zone/pricing plumbing below needs no other changes.
const KENYA_DELIVERY_BRANCHES = [
  { county: "Nairobi",     label: "Nairobi" },
  { county: "Nakuru",      label: "Nakuru" },
  { county: "Kajiado",     label: "Kitengela" },
  { county: "Uasin Gishu", label: "Eldoret" },
  { county: "Kirinyaga",   label: "Mwea" },
] as const;

const PAYSTACK_ERROR_MESSAGES: Record<string, string> = {
  payment_failed: "Payment was not completed. Please try again.",
  missing_reference: "Payment reference missing. Please try again.",
  not_found: "Payment record not found. Please try again.",
  forbidden: "Payment access denied. Please try again.",
  verify_failed: "Could not verify payment. Please try again.",
};

const labelClass = "block mb-2 text-[12px] font-semibold tracking-[0.08em] text-[#40493c] dark:text-gray-300";
const inputBase = "w-full h-13 rounded-[8px] border bg-[#fbfbfb] dark:bg-gray-800 px-4 text-[15px] text-[#1a1c1c] dark:text-white outline-none transition-colors placeholder:text-[#6b7280] focus:ring-2";
const inputNormal = `${inputBase} border-[#c0cab8] focus:border-[#27731e] focus:ring-[#27731e]/10`;
const inputError  = `${inputBase} border-red-400 focus:border-red-400 focus:ring-red-100`;
// Contact-details and delivery-details cards: 15px radius, 24px of padding
// between the inputs and the card border — deliberately its own treatment,
// distinct from the payment-method and order-summary cards below, which keep
// their old rounded-[12px]/p-6-8 styling.
const tightCard = "rounded-[15px] border border-[#dce4d8] bg-white p-[24px] shadow-sm dark:border-gray-700 dark:bg-gray-900";

function inputCls(hasError: boolean) { return hasError ? inputError : inputNormal; }

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function ss(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return sessionStorage.getItem(key) ?? fallback;
}

function capture(event: string, props?: Record<string, unknown>) {
  const ph = (window as unknown as { posthog?: { capture: (e: string, p?: Record<string, unknown>) => void } }).posthog;
  ph?.capture(event, props);
}

// ---------------------------------------------------------------------------
// Custom Preline-style select dropdown
// ---------------------------------------------------------------------------
function SelectDropdown({
  value, onChange, options, placeholder, disabled, hasError, id, searchable, loading,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  id?: string;
  searchable?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  // ponytail: subsequence fallback only kicks in when nothing matches; real fuzzy search (Levenshtein) if typos beyond dropped letters matter
  const q = fold(search.trim());
  const substringHits = searchable && q
    ? options.filter((o) => [o.label, ...(o.aliases ?? [])].some((t) => fold(t).includes(q)))
    : options;
  const filtered = searchable && q && substringHits.length === 0
    ? options.filter((o) => isSubsequence(q, fold(o.label)))
    : substringHits;

  const borderCls = hasError
    ? "border-red-400 focus:border-red-400"
    : "border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-700";

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`relative py-3 ps-4 pe-9 flex items-center gap-2 text-nowrap w-full cursor-pointer bg-white dark:bg-neutral-800 border ${borderCls} rounded-lg text-start text-sm disabled:pointer-events-none disabled:opacity-50 focus:outline-none`}
      >
        {loading ? (
          <span className="text-gray-400 text-[13px]">Loading...</span>
        ) : selected ? (
          <>
            {selected.icon && <img className="size-4 rounded-full shrink-0 object-cover" src={selected.icon} alt="" />}
            <span className="text-gray-800 dark:text-white text-[14px]">{selected.label}</span>
          </>
        ) : (
          <span className="text-gray-400 dark:text-neutral-400 text-[13px]">{placeholder ?? "Select option..."}</span>
        )}
        <div className="absolute top-1/2 end-3 -translate-y-1/2">
          <svg className="shrink-0 size-3.5 text-gray-500 dark:text-neutral-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="absolute mt-2 z-50 w-full max-h-72 bg-white dark:bg-neutral-900 border border-transparent rounded-lg shadow-xl overflow-hidden overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-neutral-500">
          {searchable && (
            <div className="bg-white dark:bg-neutral-900 p-2 sticky top-0 border-b border-gray-100 dark:border-neutral-800">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="block w-full text-sm bg-transparent border border-gray-200 dark:border-neutral-700 rounded-lg text-gray-800 dark:text-neutral-200 placeholder:text-gray-400 py-1.5 px-3 focus:outline-none focus:border-[#27731e]"
              />
            </div>
          )}
          <div className="p-1 space-y-0.5">
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
                className={`${value === opt.value ? "bg-gray-100 dark:bg-neutral-800" : ""} py-2 px-4 w-full text-sm text-gray-800 dark:text-neutral-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg flex justify-between items-center text-left`}
              >
                <div className="flex items-center gap-2">
                  {opt.icon && <img className="size-4 rounded-full shrink-0 object-cover" src={opt.icon} alt="" />}
                  <span>{opt.label}</span>
                </div>
                {value === opt.value && (
                  <svg className="shrink-0 size-3.5 text-[#27731e]" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-2 px-4 text-sm text-gray-400">No results found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function DeliveryClient({ user, isLoggedIn, branchLimited }: Props) {
  const router = useRouter();
  const { format } = useCurrency();
  const searchParams = useSearchParams();

  // Paystack's verify route redirects failures back here (via the retired
  // /payment route forwarding its ?error= — see app/payment/page.tsx) — show
  // it immediately.
  const paystackError = searchParams.get("error");
  const paystackErrorMessage = paystackError
    ? (PAYSTACK_ERROR_MESSAGES[paystackError] ?? "Payment failed. Please try again.")
    : null;

  // Records this browser for anti-farming scoring — checkout is the moment it
  // matters, since the joining bonus unlocks against these signals once this pays.
  useDeviceSignal();

  // Only reachable via the cart's "Place Order" button (which sets this
  // flag) — typing/bookmarking /delivery directly sends you back to /cart.
  const [flowChecked, setFlowChecked] = useState(false);
  useEffect(() => {
    window.setTimeout(() => {
      if (!sessionStorage.getItem(CHECKOUT_FLOW_FLAG_KEY)) {
        router.replace("/cart");
        return;
      }
      setFlowChecked(true);
      capture("checkout_started", { step: "delivery" });
    }, 0);
  }, [router]);

  const initialName = splitName(user.fullName);
  const [mode, setMode] = useState<DeliveryMode>("DELIVERY");
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [email, setEmail] = useState(user.email);
  // user.phone is already a properly combined E.164 value (phone + phoneCode
  // joined server-side via lib/phone.ts combineLegacyPhone — see app/delivery/page.tsx).
  const [phone, setPhone] = useState<PhoneValue | undefined>(
    user.phone && user.phone.startsWith("+") ? (user.phone as PhoneValue) : undefined
  );

  // Always default to Kenya — user's stored country may be a name not a code
  const [country, setCountry] = useState("KE");
  const [county, setCounty] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [state, setState] = useState("");
  const [stateText, setStateText] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [notes, setNotes] = useState("");
  const [storeId, setStoreId] = useState<string>(PICKUP_STORES[0].id);

  // Promo — initialised from cart sessionStorage so discount carries over
  const [promoCode, setPromoCode] = useState(() => ss("fechi_promo"));
  const [promoInput, setPromoInput] = useState(() => ss("fechi_promo"));
  const [promoStatus, setPromoStatus] = useState<"idle" | "loading" | "valid" | "error">(() =>
    ss("fechi_promo") ? "valid" : "idle",
  );
  const [promoMessage, setPromoMessage] = useState(() => {
    const code = ss("fechi_promo");
    return code ? `Coupon "${code}" applied` : "";
  });
  const [discountAmountKes, setDiscountAmountKes] = useState(() => {
    const v = ss("fechi_promo_amount");
    return v ? parseInt(v, 10) : 0;
  });
  const [freeDelivery, setFreeDelivery] = useState(() => ss("fechi_promo_free_shipping") === "1");
  const [referralCode, setReferralCode] = useState("");

  // Loyalty points the customer chose to spend. Sent as a *request* — the
  // server re-checks the balance and re-derives the discount itself.
  const [pointsRequested, setPointsRequested] = useState(0);
  const [pointsDiscountKes, setPointsDiscountKes] = useState(0);

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("mpesa");
  const [mpesaPhone, setMpesaPhone] = useState("");
  useEffect(() => {
    if (!mpesaPhone && phone) setMpesaPhone(phone as string);
  }, [phone, mpesaPhone]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState(0);
  const [paymentLocked, setPaymentLocked] = useState(false);

  const isKenya = country === "KE";
  const selectedStore = PICKUP_STORES.find((s) => s.id === storeId) ?? PICKUP_STORES[0];

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const countriesQuery = useQuery<{ ok: boolean; data: { countries: Country[] } }>({
    queryKey: ["countries"],
    queryFn: async () => {
      const res = await fetch("/api/countries");
      const json = await res.json().catch(() => null);
      // Throw on failure so a bad response is retried and never persisted to localStorage as "success".
      if (!res.ok || !json?.ok || !Array.isArray(json.data?.countries)) {
        console.error("[delivery] GET /api/countries failed", { status: res.status, body: json });
        throw new Error(`/api/countries failed (${res.status})`);
      }
      console.log(`[delivery] GET /api/countries ok — ${json.data.countries.length} countries`);
      return json;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const zonesQuery = useQuery<{ ok: boolean; data: { zones: Zone[] } }>({
    queryKey: ["delivery-zones", county],
    queryFn: () => fetch(`/api/delivery-zones?county=${encodeURIComponent(county)}`).then((r) => r.json()),
    enabled: mode === "DELIVERY" && isKenya && Boolean(county),
  });

  const statesQuery = useQuery<{ ok: boolean; data: { states: StateOption[]; fallback: boolean } }>({
    queryKey: ["country-states", country],
    queryFn: () => fetch(`/api/country-states?code=${encodeURIComponent(country)}`).then((r) => r.json()),
    enabled: mode === "DELIVERY" && !isKenya,
  });

  const zones = zonesQuery.data?.data?.zones ?? [];
  const selectedZone = zones.find((z) => z.id === zoneId);
  const stateOptions = statesQuery.data?.data?.states ?? [];
  const stateFallback = Boolean(statesQuery.data?.data?.fallback) || stateOptions.length === 0;
  const noZones = mode === "DELIVERY" && isKenya && Boolean(county) && !zonesQuery.isLoading && zones.length === 0;

  const pricingQuery = useQuery<{ ok: boolean; data: { feeKes: number; label: string } }>({
    queryKey: ["delivery-pricing", mode, country, county, zoneId, state, stateText],
    queryFn: () =>
      fetch("/api/delivery-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, county, zoneId: zoneId || null, deliveryType: mode }),
      }).then((r) => r.json()),
    enabled:
      mode === "PICKUP" ||
      (mode === "DELIVERY" && isKenya && Boolean(county) && Boolean(zoneId)) ||
      (mode === "DELIVERY" && !isKenya && Boolean(state || stateText)),
  });

  const cartQuery = useQuery<CartResponse>({
    queryKey: ["cart"],
    queryFn: () => fetch("/api/cart").then((r) => r.json()),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const branchesQuery = useQuery<{ ok: boolean; data: { branches: Branch[] } }>({
    queryKey: ["branches"],
    queryFn: () => fetch("/api/branches").then((r) => r.json()),
    staleTime: 24 * 60 * 60 * 1000,
  });

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const countries = countriesQuery.data?.data?.countries ?? [{ code: "KE", name: "Kenya", flag: "https://flagcdn.com/w40/ke.png" }];
  const selectedCountry = countries.find((c) => c.code === country) ?? countries[0];
  const rawFeeKes = mode === "PICKUP" ? 0 : pricingQuery.data?.data?.feeKes ?? 0;
  const feeKes = freeDelivery ? 0 : rawFeeKes;
  const feeLabel = mode === "PICKUP" ? "Free pickup" : freeDelivery ? "Free (coupon)" : (pricingQuery.data?.data?.label ?? selectedZone?.name ?? "");
  const items = cartQuery.data?.data?.items ?? [];
  const subtotalKes = cartQuery.data?.data?.subtotalKes ?? 0;
  const discountKes = promoStatus === "valid" ? discountAmountKes : 0;
  const branches = branchesQuery.data?.data?.branches ?? [];
  const selectedBranchId = mode === "PICKUP" ? selectedStore.branchId : (selectedZone?.branchId ?? null);
  const selectedBranchCardEligible = branches.find((b) => b.id === selectedBranchId)?.cardEligible ?? false;
  // Card is only offered for international orders or Nairobi/Nakuru branch locations —
  // mirrors lib/payments/card-eligibility.ts, which is the authoritative server-side check.
  const isCardEligible = !isKenya || selectedBranchCardEligible;

  // Points always apply last, on top of any coupon — same order the server
  // computes in lib/checkout/compute-totals.ts.
  const grossKes = Math.max(0, subtotalKes + feeKes - discountKes);
  const totalKes = Math.max(0, grossKes - pointsDiscountKes);
  // Nothing left to pay in cash. The server re-derives this independently and
  // refuses the points-checkout endpoint if any balance remains.
  const fullyCoveredByPoints = pointsRequested > 0 && totalKes === 0;

  // ---------------------------------------------------------------------------
  // Validation errors (computed, only surfaced when submitted)
  // ---------------------------------------------------------------------------
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Please enter your first name";
    if (!lastName.trim()) e.lastName = "Please enter your last name";
    if (!email.trim()) e.email = "Please enter your email address";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Please enter a valid email address";
    if (!phone) e.phone = "Please enter your phone number";
    if (mode === "DELIVERY") {
      if (isKenya) {
        if (!county) e.county = branchLimited ? "Please select a delivery branch" : "Please select your county";
        else if (noZones) e.zone = "No delivery zones available for this county — contact the store or pick another county";
        else if (!zoneId) e.zone = "Please select a delivery zone";
      } else {
        if (!state && !stateText.trim()) e.state = "Please select or enter your state / province";
        if (!address.trim()) e.address = "Please enter your address";
        if (!postalCode.trim()) e.postalCode = "Please enter your postal code";
      }
    }
    return e;
  }, [firstName, lastName, email, phone, mode, isKenya, county, noZones, zoneId, address, state, stateText, postalCode, branchLimited]);

  // ---------------------------------------------------------------------------
  // Promo handlers
  // ---------------------------------------------------------------------------
  async function applyPromo() {
    const next = promoInput.trim().toUpperCase();
    if (!next) { removePromo(); return; }

    // Client-side reuse guard
    try {
      const used: string[] = JSON.parse(localStorage.getItem("fechi_used_coupons") ?? "[]");
      if (used.includes(next)) {
        setPromoStatus("error");
        setPromoMessage("You've already used this coupon");
        return;
      }
    } catch { /* ignore */ }

    setPromoStatus("loading");
    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(next)}&subtotal=${subtotalKes}`);
      const json = await res.json() as {
        ok: boolean;
        data?: { valid: boolean; discount?: { amountKes: number; deliveryFree?: boolean }; message?: string; error?: string };
        error?: { message: string };
      };
      if (!json.ok) { setPromoStatus("error"); setPromoMessage(json.error?.message ?? "Could not validate coupon"); return; }
      const data = json.data!;
      if (!data.valid) { setPromoStatus("error"); setPromoMessage(data.error ?? "Invalid coupon code"); return; }
      const amountKes = data.discount?.amountKes ?? 0;
      const isFreeDelivery = Boolean(data.discount?.deliveryFree);
      setPromoCode(next);
      setDiscountAmountKes(amountKes);
      setFreeDelivery(isFreeDelivery);
      setPromoMessage(data.message ?? "Coupon applied");
      setPromoStatus("valid");
      sessionStorage.setItem("fechi_promo", next);
      sessionStorage.setItem("fechi_promo_amount", String(amountKes));
      sessionStorage.setItem("fechi_promo_free_shipping", isFreeDelivery ? "1" : "0");
    } catch {
      setPromoStatus("error");
      setPromoMessage("Failed to validate coupon — please try again");
    }
  }

  function removePromo() {
    setPromoCode(""); setPromoInput(""); setPromoStatus("idle"); setPromoMessage("");
    setDiscountAmountKes(0); setFreeDelivery(false);
    sessionStorage.removeItem("fechi_promo");
    sessionStorage.removeItem("fechi_promo_amount");
    sessionStorage.removeItem("fechi_promo_free_shipping");
  }

  function handleCountryChange(next: string) {
    setCountry(next); setCounty(""); setZoneId(""); setState(""); setStateText("");
    capture("delivery_country_selected", { country: next });
  }

  // ---------------------------------------------------------------------------
  // Submit — builds the order payload locally (no more sessionStorage
  // handoff to a separate /payment page) and calls the matching
  // payment-initiate route directly.
  // ---------------------------------------------------------------------------
  function buildDeliveryData() {
    return {
      fullName: `${firstName} ${lastName}`.trim(),
      firstName, lastName, email,
      phone: phone as string,
      country,
      countryName: selectedCountry?.name ?? country,
      county:  mode === "PICKUP" ? selectedStore.county : isKenya ? county : "",
      state:   mode === "PICKUP" ? selectedStore.city  : isKenya ? county : state || stateText,
      zoneId:  mode === "DELIVERY" ? (zoneId || null) : null,
      deliveryZone: mode === "DELIVERY" ? (selectedZone?.name ?? null) : null,
      address,
      city:       mode === "PICKUP" ? selectedStore.city : isKenya ? county : state || stateText,
      postalCode, notes,
      deliveryType: mode,
      branchId:   mode === "PICKUP" ? selectedStore.branchId : (selectedZone?.branchId ?? null),
      branchName: mode === "PICKUP" ? selectedStore.name : null,
      deliveryKes: feeKes,
      deliveryFeeLabel: feeLabel,
      promoCode: promoCode.trim().toUpperCase() || null,
      referralCode: referralCode.trim().toUpperCase() || null,
      isCardEligible,
      pointsRequested,
    };
  }

  async function handleMpesaPay() {
    setSubmitting(true);
    capture("payment_initiated", { method: "mpesa" });
    try {
      const res = await fetch("/api/payments/mpesa/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mpesaPhone, deliveryData: buildDeliveryData() }),
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
    setSubmitting(true);
    capture("payment_initiated", { method: "card" });
    try {
      const res = await fetch("/api/payments/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryData: buildDeliveryData() }),
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

  async function handlePointsPay() {
    setSubmitting(true);
    capture("payment_initiated", { method: "points" });
    try {
      const res = await fetch("/api/payments/points/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryData: buildDeliveryData() }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { orderId: string };
        error?: { message: string };
      };
      if (!res.ok || !json.data?.orderId) {
        toast.error(json.error?.message ?? "Could not complete your order. Please try again.");
        return;
      }
      router.push(`/order-success/${json.data.orderId}`);
    } catch {
      toast.error("Could not complete your order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone) {
      toast.error("Please fill in your first name, last name, email, and phone number.");
      return;
    }
    if (Object.keys(errors).length > 0) {
      toast.error("Please fix the highlighted fields before continuing.");
      return;
    }
    if (pricingQuery.isFetching) return;
    if (paymentLocked) {
      toast.warning("Please wait a moment", { message: "Give it about 30 seconds before trying to pay again." });
      return;
    }
    if (!fullyCoveredByPoints && selectedMethod === "mpesa" && !mpesaPhone.trim()) {
      toast.error("Please enter the M-Pesa phone number to receive the prompt on.");
      return;
    }

    capture("delivery_form_completed", { country, mode, feeKes });
    // Points covered the whole bill — there is nothing for a gateway to
    // collect, so skip it entirely rather than pushing a KSh 0 STK request.
    if (fullyCoveredByPoints) void handlePointsPay();
    else if (selectedMethod === "mpesa") void handleMpesaPay();
    else void handleCardPay();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const showErr = (key: string) => submitted ? errors[key] : undefined;

  const countryOptions: SelectOption[] = countries.map((c) => ({ value: c.code, label: c.name, icon: c.flag, aliases: c.aliases }));
  const countyOptions: SelectOption[] = branchLimited
    ? KENYA_DELIVERY_BRANCHES.map((b) => ({ value: b.county, label: b.label }))
    : KENYA_COUNTIES.map((c) => ({ value: c, label: c }));
  const zoneOptions: SelectOption[] = zones.map((z) => ({ value: z.id, label: `${z.name} — ${format(z.deliveryFeeKes)}` }));
  const storeOptions: SelectOption[] = PICKUP_STORES.map((s) => ({ value: s.id, label: s.name }));
  const stateSelectOptions: SelectOption[] = stateOptions.map((s) => ({ value: s.name, label: s.name }));

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------
  if (!flowChecked) {
    return (
      <div className="min-h-screen bg-[#f8f8f7] dark:bg-gray-950 flex items-center justify-center">
        <Icon icon="mdi:loading" width={30} className="animate-spin text-[#27731e]" />
      </div>
    );
  }

  return (
    <>
    <Navbar />
    <div className="min-h-screen bg-[#f8f8f7] dark:bg-gray-950">

      <main className="mx-auto w-full max-w-[1180px] px-4 py-10 md:py-14">
        <div className="mb-8"><StepIndicator step={2} /></div>
        <h1 className="mb-6 font-heading text-[32px] font-bold text-[#1a1c1c] dark:text-white">Checkout</h1>

        {paystackErrorMessage ? (
          <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-red-200 bg-red-50 px-5 py-4 text-[14px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            <Icon icon="mdi:alert-circle-outline" width={20} className="mt-0.5 shrink-0" />
            <span>{paystackErrorMessage}</span>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start">

          {/* ─── Left: form ─── */}
          <section>
            <form id="checkout-form" onSubmit={handleSubmit}>
              {/* Contact details card */}
              <div className={tightCard}>
                <h2 className="mb-5 font-heading text-[18px] font-bold text-[#1a1c1c] dark:text-white">Contact Details</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="First Name" error={showErr("firstName")}>
                    <input className={inputCls(!!showErr("firstName"))} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Jane" />
                  </Field>
                  <Field label="Last Name" error={showErr("lastName")}>
                    <input className={inputCls(!!showErr("lastName"))} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Doe" />
                  </Field>
                  <PhoneInput label="Phone Number" value={phone} onChange={setPhone} error={showErr("phone")} />
                  <Field label="Email Address" error={showErr("email")}>
                    <input type="email" className={inputCls(!!showErr("email"))} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
                  </Field>
                </div>
              </div>

              {/* Mode toggle — between the contact and delivery cards */}
              <div className="my-6 grid grid-cols-2 gap-2 rounded-[10px] bg-[#f0f0ef] p-2">
                {(["DELIVERY", "PICKUP"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setMode(v)}
                    className={`flex h-10 items-center justify-center gap-2 rounded-[8px] text-[13px] font-bold transition-colors ${mode === v ? "bg-white text-[#0b6b13] shadow-sm" : "text-[#40493c]"}`}>
                    <Icon icon={v === "DELIVERY" ? "mdi:truck-delivery-outline" : "mdi:store-outline"} width={16} />
                    {v === "DELIVERY" ? "Home Delivery" : "Pickup from Store"}
                  </button>
                ))}
              </div>

              {/* Delivery details card */}
              <div className={tightCard}>
                  <div className="mb-5 flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f3e6] text-[#0b6b13] dark:bg-[#0b6b13]/20">
                      <Icon icon={MODE_COPY[mode].icon} width={18} />
                    </span>
                    <div>
                      <p className="text-[14px] font-bold text-[#1a1c1c] dark:text-white">{MODE_COPY[mode].heading}</p>
                      <p className="text-[12px] text-[#6b7568] dark:text-gray-400">{MODE_COPY[mode].description}</p>
                    </div>
                  </div>

                  {mode === "DELIVERY" ? (
                    <div className="space-y-5">
                      <div className="grid gap-5 sm:grid-cols-2">
                        {/* Country */}
                        <Field label="Country">
                          <SelectDropdown
                            value={country}
                            onChange={handleCountryChange}
                            options={countryOptions}
                            placeholder="Select country..."
                            loading={countriesQuery.isLoading}
                            searchable
                          />
                        </Field>

                        {/* Branch (branch-limited Kenya) / County (full Kenya) / State (International) */}
                        {isKenya ? (
                          <Field label={branchLimited ? "Delivery Branch" : "County"} error={showErr("county")}>
                            <SelectDropdown
                              value={county}
                              onChange={(v) => { setCounty(v); setZoneId(""); }}
                              options={countyOptions}
                              placeholder={branchLimited ? "Select a delivery branch" : "Select a county"}
                              hasError={!!showErr("county")}
                              searchable={!branchLimited}
                            />
                          </Field>
                        ) : (
                          <Field label="State / Province" error={showErr("state")}>
                            {statesQuery.isLoading ? (
                              <div className="h-13 rounded-[8px] bg-[#eef4eb] animate-pulse" />
                            ) : stateFallback ? (
                              <input
                                className={inputCls(!!showErr("state"))}
                                value={stateText}
                                onChange={(e) => setStateText(e.target.value)}
                                placeholder="State or province"
                              />
                            ) : (
                              <SelectDropdown
                                value={state}
                                onChange={setState}
                                options={stateSelectOptions}
                                placeholder="Select state"
                                hasError={!!showErr("state")}
                                searchable
                              />
                            )}
                          </Field>
                        )}
                      </div>

                      {/* Delivery Zone (Kenya only) */}
                      {isKenya && (
                        <Field label="Delivery Zone" error={showErr("zone")}>
                          <SelectDropdown
                            value={zoneId}
                            onChange={(v) => { setZoneId(v); capture("delivery_zone_selected", { zoneId: v }); }}
                            options={zoneOptions}
                            placeholder={
                              !county ? (branchLimited ? "Select a delivery branch first" : "Select a county first") :
                              noZones ? "No zones available — contact us or pick another county" :
                              "Select a delivery zone"
                            }
                            disabled={!county || noZones}
                            loading={zonesQuery.isLoading && Boolean(county)}
                            hasError={!!showErr("zone")}
                            searchable
                          />
                        </Field>
                      )}

                      {/* Town / Estate / Building (Kenya) or Address (International) */}
                      {isKenya ? (
                        <Field label="Town / Estate / Building (Optional)">
                          <input
                            className={inputNormal}
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder={!zoneId ? "Select a delivery zone first" : "e.g. Westlands, The Mirage"}
                            disabled={!zoneId}
                          />
                        </Field>
                      ) : (
                        <div className="grid gap-5 sm:grid-cols-2">
                          <Field label="Address Line" error={showErr("address")}>
                            <input
                              className={inputCls(!!showErr("address"))}
                              value={address}
                              onChange={(e) => setAddress(e.target.value)}
                              placeholder="Street, building, apartment"
                            />
                          </Field>
                          <Field label="Zip / Postal Code" error={showErr("postalCode")}>
                            <input
                              className={inputCls(!!showErr("postalCode"))}
                              value={postalCode}
                              onChange={(e) => setPostalCode(e.target.value)}
                              placeholder="Postal code"
                            />
                          </Field>
                        </div>
                      )}

                      <Field label="Delivery Notes (Optional)">
                        <textarea rows={4} className={`${inputNormal} h-auto resize-none py-4`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any specific instructions for the rider?" />
                      </Field>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <Field label="Store Location">
                        <SelectDropdown
                          value={storeId}
                          onChange={setStoreId}
                          options={storeOptions}
                          placeholder="Select a store"
                        />
                      </Field>
                      <Field label="Additional Notes (Optional)">
                        <textarea rows={4} className={`${inputNormal} h-auto resize-none py-4`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the store team should know?" />
                      </Field>
                    </div>
                  )}
              </div>

              {/* Payment method — unchanged styling from the old /payment page */}
              <section className="mt-6 rounded-[12px] border border-[#e1e8de] bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <Icon icon="mdi:wallet-outline" width={22} className="text-[#0b6b13]" />
                  <div>
                    <h2 className="font-heading text-[24px] font-bold text-[#1a1c1c] dark:text-white">Choose Payment Method</h2>
                    <p className="mt-2 text-[13px] text-[#40493c] dark:text-gray-400">All transactions are secure and encrypted.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {fullyCoveredByPoints ? (
                    <div className="rounded-[12px] border-2 border-[#27731e] bg-[#f4fff3] p-5">
                      <div className="flex items-center gap-2">
                        <Icon icon="mdi:trophy-outline" width={20} className="text-[#27731e]" />
                        <h3 className="font-heading text-[17px] font-bold text-[#1a1c1c]">
                          Paying with Fechi Points
                        </h3>
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-[#40493c]">
                        Your {pointsRequested.toLocaleString()} points cover this order in full, so
                        there&apos;s nothing left to pay. No M-Pesa prompt or card needed — just
                        place your order below.
                      </p>
                    </div>
                  ) : (
                    <>
                      <PaymentOption active={selectedMethod === "mpesa"} onClick={() => setSelectedMethod("mpesa")} title="M-Pesa STK Push" badge="M-PESA">
                        <p className="mb-4 text-[13px] text-[#40493c] dark:text-gray-200">You will receive a prompt on your phone to complete the payment.</p>
                        <label className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-[#40493c] dark:text-gray-200">Enter Your M-Pesa Phone Number</label>
                        <input value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} className="h-12 w-full rounded-[8px] border border-[#c0cab8] dark:border-[#27731e] bg-[#fbfbfb] dark:bg-gray-800 px-4 text-[16px] text-text-dark dark:text-white/90 text-bold outline-none focus:border-yellow-cta" />
                      </PaymentOption>
                      {isCardEligible && (
                        <PaymentOption active={selectedMethod === "card"} onClick={() => setSelectedMethod("card")} title="Credit / Debit Card" badge="VISA  MC" />
                      )}
                    </>
                  )}
                </div>

                <div className="mt-10 flex flex-wrap justify-center gap-8 text-[12px] font-bold uppercase tracking-[0.12em] text-[#707a6b]">
                  <span className="flex items-center gap-2"><Icon icon="mdi:lock-outline" width={16} className="text-[#27731e]" /> SSL Secured</span>
                  <span className="flex items-center gap-2"><Icon icon="mdi:shield-check-outline" width={16} className="text-[#27731e]" /> Encrypted</span>
                  <span className="flex items-center gap-2"><Icon icon="mdi:message-outline" width={16} className="text-[#27731e]" /> 24/7 Support</span>
                </div>
              </section>
            </form>
          </section>

          {/* ─── Right: Order summary ─── */}
          <aside className="rounded-[12px] border border-[#dce4d8] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.05)] dark:border-gray-700 dark:bg-gray-900 md:p-8 lg:sticky lg:top-24">
            <h2 className="font-heading text-[24px] font-bold text-[#1a1c1c] dark:text-white">Order Summary</h2>
            <div className="mt-6 space-y-4">
              {items.length ? items.map((item) => (
                <div key={item.productId} className="flex items-center gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[8px] bg-[#eef4eb]">
                    {item.primaryImageUrl ? <Image src={item.primaryImageUrl} alt={item.name} fill className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-[#1a1c1c] dark:text-white">{item.name}</p>
                    <p className="text-[12px] text-[#40493c] dark:text-gray-400">Qty: {item.quantity}</p>
                  </div>
                  <p className="text-[14px] font-bold text-[#1a1c1c] dark:text-white">{format(item.lineTotalKes)}</p>
                </div>
              )) : <p className="text-sm text-[#40493c]">Your cart is empty.</p>}
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            {/* Referral code — doesn't discount this order; see prisma/schema.prisma's pendingReferralCode comment */}
            <div>
              <label className={labelClass}>Referral Code (Optional)</label>
              <input
                className={inputNormal}
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Got a friend's code?"
              />
            </div>

            {isLoggedIn && (
              <div className="my-6">
                <PointsRedeemInput
                  grossCents={grossKes}
                  appliedPoints={pointsRequested}
                  disabled={submitting || paymentLocked}
                  onApply={(points, discountCents) => {
                    setPointsRequested(points);
                    setPointsDiscountKes(discountCents);
                  }}
                  onRemove={() => {
                    setPointsRequested(0);
                    setPointsDiscountKes(0);
                  }}
                />
              </div>
            )}

            {/* Coupon */}
            <div className="mt-6">
              {promoStatus === "valid" ? (
                <div className="flex items-center gap-2 rounded-[8px] border border-[#27731e] bg-[#f0fbed] px-4 py-3">
                  <Icon icon="mdi:tag-check-outline" width={16} className="shrink-0 text-[#27731e]" />
                  <span className="flex-1 text-[13px] font-bold text-[#27731e]">{promoMessage}</span>
                  <button type="button" onClick={removePromo} aria-label="Remove coupon" className="ml-2 text-[#27731e] hover:text-[#0b4a10]">
                    <Icon icon="mdi:close" width={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      className={inputNormal}
                      value={promoInput}
                      onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoStatus("idle"); }}
                      placeholder="Coupon code"
                      disabled={promoStatus === "loading"}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyPromo(); } }}
                    />
                    <button
                      type="button"
                      onClick={() => void applyPromo()}
                      disabled={promoStatus === "loading" || !promoInput.trim()}
                      className="h-13 rounded-[8px] bg-[#eeeeee] px-5 text-[13px] font-bold text-[#1a1c1c] hover:bg-[#fec700] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {promoStatus === "loading" ? <Icon icon="mdi:loading" width={16} className="animate-spin" /> : "Apply"}
                    </button>
                  </div>
                  {promoStatus === "error" && (
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-red-600">
                      <Icon icon="mdi:alert-circle-outline" width={14} />
                      {promoMessage}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="space-y-3 text-[15px]">
              <SummaryRow label="Subtotal" value={format(subtotalKes)} />
              <SummaryRow
                label={mode === "PICKUP" ? "Pickup" : "Delivery"}
                value={pricingQuery.isFetching ? "Calculating..." : (feeKes ? format(feeKes) : "Free")}
              />
              {discountKes > 0 && <SummaryRow label="Discount" value={`- ${format(discountKes)}`} green />}
              {pointsDiscountKes > 0 && (
                <SummaryRow
                  label={`Fechi points (${pointsRequested.toLocaleString()} pts)`}
                  value={`- ${format(pointsDiscountKes)}`}
                  green
                />
              )}
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="flex items-end justify-between">
              <span className="text-[22px] font-bold text-[#1a1c1c] dark:text-white">
                {pointsDiscountKes > 0 ? "Left to pay" : "Total"}
              </span>
              <span className="text-[32px] font-black text-[#1a1c1c] dark:text-white">{format(totalKes)}</span>
            </div>

            <button
              type="submit"
              form="checkout-form"
              disabled={
                submitting ||
                pricingQuery.isFetching ||
                paymentLocked ||
                (!fullyCoveredByPoints && selectedMethod === "mpesa" && !mpesaPhone.trim())
              }
              className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#fec700] text-[15px] font-black uppercase tracking-[0.08em] text-[#1a1c1c] transition-colors hover:bg-[#f0b800] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                icon={submitting ? "mdi:loading" : fullyCoveredByPoints ? "mdi:trophy-outline" : "mdi:lock-outline"}
                width={18}
                className={submitting ? "animate-spin" : ""}
              />
              {fullyCoveredByPoints ? "Complete Order with Points" : "Place Order & Pay"}
            </button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] tracking-[0.08em] text-[#707a6b]">
              <Icon icon="mdi:lock-outline" width={14} />
              Secure encrypted checkout
            </p>
          </aside>
        </div>
      </main>
    </div>

    {showModal && activeOrderId ? (
      <PaymentStatusModal
        orderId={activeOrderId}
        onClose={(wasFailure, reason) => {
          setShowModal(false);
          setActiveOrderId(null);
          if (wasFailure) {
            const next = failureCount + 1;
            setFailureCount(next);
            if (next >= 5) {
              toast.error("Too many failed attempts. Please try again later or contact support.");
              router.push("/cart");
            }
            if (reason?.split(":")[0] === "1032") {
              setPaymentLocked(true);
              window.setTimeout(() => setPaymentLocked(false), 30_000);
            }
          }
        }}
      />
    ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Payment-status modal (moved here from the retired /payment page)
// ---------------------------------------------------------------------------
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

function PaymentStatusModal({ orderId, onClose }: { orderId: string; onClose: (wasFailure?: boolean, reason?: string | null) => void }) {
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
            <button onClick={() => onClose(true, reason)} className="mt-6 h-12 w-full rounded-full bg-[#fec700] text-[14px] font-black text-[#1a1c1c] transition-colors hover:bg-[#f0b800]">Try Again</button>
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
      className={`w-full rounded-[10px] border p-4 text-left transition-colors ${active ? "border-[#0b6b13] bg-[#f6fbf5] dark:bg-gray-700 ring-1 ring-[#0b6b13]" : "border-[#dce4d8] bg-white dark:bg-gray-700 hover:border-[#a9b8a2]"}`}
    >
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full border ${active ? "border-[#0b6b13] bg-[#a4f690] ring-2 ring-offset-2 ring-[#a4f690]" : "border-[#7b8975]"}`} />
        <span className="flex-1 text-[16px] font-bold text-[#1a1c1c] dark:text-white">{title}</span>
        {badge ? <span className="rounded-[4px] border border-[#dce4d8] dark:border-gray-600 px-2 py-1 text-[10px] font-black text-[#0b6b13] dark:text-green-400">{badge}</span> : null}
        {icon ? <Icon icon={icon} width={22} className="text-[#707a6b]" /> : null}
      </div>
      {active && children ? <div className="ml-8 mt-5">{children}</div> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-red-600">
          <Icon icon="mdi:alert-circle-outline" width={14} />
          {error}
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${green ? "text-[#0b6b13]" : "text-[#40493c] dark:text-gray-300"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
