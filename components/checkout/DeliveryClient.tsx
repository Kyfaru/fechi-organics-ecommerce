"use client";

import { FormEvent, useMemo, useRef, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import type { Value as PhoneValue } from "react-phone-number-input";
import { Navbar } from "@/components/layout/Navbar";
import { StepIndicator } from "@/components/checkout/StepIndicator";
import PhoneInput from "@/components/ui/PhoneInput";
import { KENYA_COUNTIES } from "@/lib/kenya-counties";
import { toast } from "@/lib/toast";
import { useCurrency } from "@/app/providers";

type DeliveryMode = "DELIVERY" | "PICKUP";
type Country = { code: string; name: string; flag: string };
type Zone = { id: string; name: string; deliveryFeeKes: number; branchId: string | null };
type StateOption = { code: string; name: string };
type CartItem = { productId: string; name: string; quantity: number; lineTotalKes: number; primaryImageUrl?: string };
type CartResponse = { ok: boolean; data: { items: CartItem[]; subtotalKes: number; itemCount: number } };
type SelectOption = { value: string; label: string; icon?: string };

type Props = {
  user: { fullName: string; email: string; phone: string; country: string };
};

const MODE_COPY: Record<DeliveryMode, { heading: string; description: string; icon: string }> = {
  DELIVERY: {
    heading: "Home Delivery Details",
    description: "We'll bring your order straight to your door.",
    icon: "mdi:truck-delivery-outline",
  },
  PICKUP: {
    heading: "Store Pickup Details",
    description: "Collect your order from one of our store locations.",
    icon: "mdi:store-outline",
  },
};

const PICKUP_STORES = [
  { id: "pickup-nairobi",   branchId: "branch-nairobi",  city: "Nairobi",     county: "Nairobi",      name: "Nairobi — Spur Mall, 1st Floor, Shop F12" },
  { id: "pickup-nakuru",    branchId: "branch-nakuru",   city: "Nakuru",      county: "Nakuru",       name: "Nakuru — Baraka Plaza, 1st Floor, Shop F2" },
  { id: "pickup-kitengela", branchId: null,              city: "Kitengela",   county: "Kajiado",      name: "Kitengela — Next to Eastmart, 2nd Floor, Shop 63" },
  { id: "pickup-eldoret",   branchId: "branch-eldoret",  city: "Eldoret",     county: "Uasin Gishu",  name: "Eldoret — Eldo Center, 1st Floor, Shop 6" },
  { id: "pickup-mwea",      branchId: null,              city: "Mwea",        county: "Kirinyaga",    name: "Mwea — MTC Building, Opp. Nice City, 1st Floor" },
] as const;

const labelClass = "block mb-2 text-[12px] font-semibold tracking-[0.08em] text-[#40493c] dark:text-gray-300";
const inputBase = "w-full h-13 rounded-[8px] border bg-[#fbfbfb] dark:bg-gray-800 px-4 text-[15px] text-[#1a1c1c] dark:text-white outline-none transition-colors placeholder:text-[#6b7280] focus:ring-2";
const inputNormal = `${inputBase} border-[#c0cab8] focus:border-[#27731e] focus:ring-[#27731e]/10`;
const inputError  = `${inputBase} border-red-400 focus:border-red-400 focus:ring-red-100`;

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
  const filtered = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

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
export function DeliveryClient({ user }: Props) {
  const router = useRouter();
  const { format } = useCurrency();
  const initialName = splitName(user.fullName);
  const [mode, setMode] = useState<DeliveryMode>("DELIVERY");
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState<PhoneValue | undefined>(() => {
    const p = user.phone;
    if (!p) return undefined;
    if (p.startsWith("+")) return p as PhoneValue;
    if (p.startsWith("0")) return `+254${p.slice(1)}` as PhoneValue;
    return p as PhoneValue;
  });

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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isKenya = country === "KE";
  const selectedStore = PICKUP_STORES.find((s) => s.id === storeId) ?? PICKUP_STORES[0];

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const countriesQuery = useQuery<{ ok: boolean; data: { countries: Country[] } }>({
    queryKey: ["countries"],
    queryFn: () => fetch("/api/countries").then((r) => r.json()),
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
  const totalKes = subtotalKes + feeKes - discountKes;

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
        if (!county) e.county = "Please select your county";
        else if (noZones) e.zone = "No delivery zones available for this county — contact the store or pick another county";
        else if (!zoneId) e.zone = "Please select a delivery zone";
        if (!address.trim()) e.address = "Please enter your town, estate, or building";
      } else {
        if (!state && !stateText.trim()) e.state = "Please select or enter your state / province";
        if (!address.trim()) e.address = "Please enter your address";
        if (!postalCode.trim()) e.postalCode = "Please enter your postal code";
      }
    }
    return e;
  }, [firstName, lastName, email, phone, mode, isKenya, county, noZones, zoneId, address, state, stateText, postalCode]);

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
  // Submit
  // ---------------------------------------------------------------------------
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

    setSubmitting(true);
    try {
      const deliveryData = {
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
      };
      sessionStorage.setItem("fechi_delivery", JSON.stringify(deliveryData));
      capture("delivery_form_completed", { country, mode, feeKes });
      router.push("/payment");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const showErr = (key: string) => submitted ? errors[key] : undefined;

  const countryOptions: SelectOption[] = countries.map((c) => ({ value: c.code, label: c.name, icon: c.flag }));
  const countyOptions: SelectOption[] = KENYA_COUNTIES.map((c) => ({ value: c, label: c }));
  const zoneOptions: SelectOption[] = zones.map((z) => ({ value: z.id, label: `${z.name} — ${format(z.deliveryFeeKes)}` }));
  const storeOptions: SelectOption[] = PICKUP_STORES.map((s) => ({ value: s.id, label: s.name }));
  const stateSelectOptions: SelectOption[] = stateOptions.map((s) => ({ value: s.name, label: s.name }));

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------
  return (
    <>
    <Navbar />
    <div className="min-h-screen bg-[#f8f8f7] dark:bg-gray-950">
      
      <main className="mx-auto w-full max-w-[1180px] px-4 py-10 md:py-14">
        <div className="mb-8"><StepIndicator step={2} /></div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start">

          {/* ─── Left: form ─── */}
          <section>
            <h1 className="mb-6 font-heading text-[32px] font-bold text-[#1a1c1c] dark:text-white">Delivery Details</h1>

            {/* Mode toggle */}
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-[10px] bg-[#f0f0ef] p-2">
              {(["DELIVERY", "PICKUP"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setMode(v)}
                  className={`flex h-10 items-center justify-center gap-2 rounded-[8px] text-[13px] font-bold transition-colors ${mode === v ? "bg-white text-[#0b6b13] shadow-sm" : "text-[#40493c]"}`}>
                  <Icon icon={v === "DELIVERY" ? "mdi:truck-delivery-outline" : "mdi:store-outline"} width={16} />
                  {v === "DELIVERY" ? "Home Delivery" : "Pickup from Store"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                className="mb-4 flex items-center gap-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f3e6] text-[#0b6b13] dark:bg-[#0b6b13]/20">
                  <Icon icon={MODE_COPY[mode].icon} width={18} />
                </span>
                <div>
                  <p className="text-[14px] font-bold text-[#1a1c1c] dark:text-white">{MODE_COPY[mode].heading}</p>
                  <p className="text-[12px] text-[#6b7568] dark:text-gray-400">{MODE_COPY[mode].description}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            <form id="delivery-details-form" onSubmit={handleSubmit} className="rounded-[12px] border border-[#dce4d8] bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:p-8">
              {/* Contact fields */}
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

              <div className="my-6 h-px bg-[#e6ebe3]" />

              {/* ─── Delivery mode ─── */}
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

                    {/* County (Kenya) / State (International) */}
                    {isKenya ? (
                      <Field label="County" error={showErr("county")}>
                        <SelectDropdown
                          value={county}
                          onChange={(v) => { setCounty(v); setZoneId(""); }}
                          options={countyOptions}
                          placeholder="Select a county"
                          hasError={!!showErr("county")}
                          searchable
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
                          !county ? "Select a county first" :
                          noZones ? "No zones available — contact us or pick another county" :
                          "Select a delivery zone"
                        }
                        disabled={!county || noZones}
                        loading={zonesQuery.isLoading && Boolean(county)}
                        hasError={!!showErr("zone")}
                      />
                    </Field>
                  )}

                  {/* Town / Estate / Building (Kenya) or Address (International) */}
                  {isKenya ? (
                    <Field label="Town / Estate / Building" error={showErr("address")}>
                      <input
                        className={inputCls(!!showErr("address"))}
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
                /* ─── Pickup mode ─── */
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
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="flex items-end justify-between">
              <span className="text-[22px] font-bold text-[#1a1c1c] dark:text-white">Total</span>
              <span className="text-[32px] font-black text-[#1a1c1c] dark:text-white">{format(totalKes)}</span>
            </div>

            <button
              type="submit"
              form="delivery-details-form"
              disabled={submitting || pricingQuery.isFetching}
              className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#fec700] text-[12px] font-black uppercase tracking-[0.12em] text-[#1a1c1c] transition-colors hover:bg-[#f0b800] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Icon icon="mdi:loading" width={16} className="animate-spin" /> : null}
              Continue to Payment
              <Icon icon="mdi:arrow-right" width={16} />
            </button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] tracking-[0.08em] text-[#707a6b]">
              <Icon icon="mdi:lock-outline" width={14} />
              Secure encrypted checkout
            </p>
          </aside>
        </div>
      </main>
    </div>
    </>
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
