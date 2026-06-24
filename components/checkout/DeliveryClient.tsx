"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import type { Value as PhoneValue } from "react-phone-number-input";
import { Navbar } from "@/components/layout/Navbar";
import { StepIndicator } from "@/components/checkout/StepIndicator";
import PhoneInput from "@/components/auth/PhoneInput";
import { KENYA_COUNTIES } from "@/lib/kenya-counties";
import { toast } from "@/lib/toast";

type DeliveryMode = "DELIVERY" | "PICKUP";
type Country = { code: string; name: string; flag: string };
type Zone = { id: string; name: string; deliveryFeeKes: number; branchId: string | null };
type StateOption = { code: string; name: string };
type CartItem = { productId: string; name: string; quantity: number; lineTotalKes: number; primaryImageUrl?: string };
type CartResponse = { ok: boolean; data: { items: CartItem[]; subtotalKes: number; itemCount: number } };

type Props = {
  user: {
    fullName: string;
    email: string;
    phone: string;
    country: string;
  };
};

const PICKUP_STORES = [
  { id: "pickup-nairobi", branchId: "branch-nairobi", city: "Nairobi", county: "Nairobi", name: "Nairobi - Spur Mall, 1st Floor, Shop F12" },
  { id: "pickup-nakuru", branchId: "branch-nakuru", city: "Nakuru", county: "Nakuru", name: "Nakuru - Baraka Plaza, 1st Floor, Shop F2" },
  { id: "pickup-kitengela", branchId: null, city: "Kitengela", county: "Kajiado", name: "Kitengela - Next to Eastmart, 2nd Floor, Shop 63" },
  { id: "pickup-eldoret", branchId: "branch-eldoret", city: "Eldoret", county: "Uasin Gishu", name: "Eldoret - Eldo Center, 1st Floor, Shop 6" },
  { id: "pickup-mwea", branchId: null, city: "Mwea", county: "Kirinyaga", name: "Mwea - MTC Building, Opp. Nice City, 1st Floor" },
] as const;

const inputClass =
  "w-full h-13 rounded-[8px] border border-[#c0cab8] bg-[#fbfbfb] dark:bg-gray-800 px-4 text-[15px] text-[#1a1c1c] dark:text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-[#27731e] focus:ring-2 focus:ring-[#27731e]/10";
const labelClass = "block mb-2 text-[12px] font-semibold tracking-[0.08em] text-[#40493c] dark:text-gray-300";

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function readStoredPromo() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("fechi_promo") ?? "";
}

function capture(event: string, props?: Record<string, unknown>) {
  const posthog = (window as unknown as { posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } }).posthog;
  posthog?.capture(event, props);
}

export function DeliveryClient({ user }: Props) {
  const router = useRouter();
  const initialName = splitName(user.fullName);
  const [mode, setMode] = useState<DeliveryMode>("DELIVERY");
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState<PhoneValue | undefined>((user.phone || undefined) as PhoneValue | undefined);
  const [country, setCountry] = useState(user.country || "KE");
  const [county, setCounty] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [state, setState] = useState("");
  const [stateText, setStateText] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [notes, setNotes] = useState("");
  const [storeId, setStoreId] = useState<string>(PICKUP_STORES[0].id);
  const [promoCode, setPromoCode] = useState(readStoredPromo);
  const [promoInput, setPromoInput] = useState(readStoredPromo);
  const [promoStatus, setPromoStatus] = useState<"idle" | "loading" | "valid" | "error">(() => (readStoredPromo() ? "valid" : "idle"));
  const [promoMessage, setPromoMessage] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const isKenya = country === "KE";
  const selectedStore = PICKUP_STORES.find((store) => store.id === storeId) ?? PICKUP_STORES[0];

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
  const selectedZone = zones.find((zone) => zone.id === zoneId);
  const stateOptions = statesQuery.data?.data?.states ?? [];
  const stateFallback = Boolean(statesQuery.data?.data?.fallback) || stateOptions.length === 0;

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

  const countries = countriesQuery.data?.data?.countries ?? [{ code: "KE", name: "Kenya", flag: "https://flagcdn.com/w40/ke.png" }];
  const selectedCountry = countries.find((item) => item.code === country) ?? countries[0];
  const feeKes = mode === "PICKUP" ? 0 : pricingQuery.data?.data?.feeKes ?? 0;
  const feeLabel = mode === "PICKUP" ? "Free pickup" : pricingQuery.data?.data?.label ?? selectedZone?.name ?? "";
  const items = cartQuery.data?.data?.items ?? [];
  const subtotalKes = cartQuery.data?.data?.subtotalKes ?? 0;
  // discountAmountKes is stored in state after the API validates the coupon
  const [discountAmountKes, setDiscountAmountKes] = useState(0);
  const discountKes = promoStatus === "valid" ? discountAmountKes : 0;
  const totalKes = subtotalKes + feeKes - discountKes;
  const noZones = mode === "DELIVERY" && isKenya && county && !zonesQuery.isLoading && zones.length === 0;

  const canContinue = useMemo(() => {
    if (submitting || pricingQuery.isFetching || !firstName.trim() || !lastName.trim() || !email.trim() || !phone) return false;
    if (mode === "PICKUP") return Boolean(storeId);
    if (isKenya) return Boolean(country && county && zoneId && !noZones);
    return Boolean(country && (state || stateText).trim() && address.trim() && postalCode.trim());
  }, [address, country, county, email, firstName, isKenya, lastName, mode, noZones, phone, postalCode, pricingQuery.isFetching, state, stateText, storeId, submitting, zoneId]);

  async function applyPromo() {
    const next = promoInput.trim().toUpperCase();
    if (!next) {
      removePromo();
      return;
    }
    setPromoStatus("loading");
    try {
      const res = await fetch(
        `/api/coupons/validate?code=${encodeURIComponent(next)}&subtotal=${subtotalKes}`,
      );
      const json = await res.json() as {
        ok: boolean;
        data?: { valid: boolean; discount?: { amountKes: number }; message?: string; error?: string };
        error?: { message: string };
      };

      if (!json.ok) {
        setPromoStatus("error");
        setPromoMessage(json.error?.message ?? "Could not validate coupon");
        return;
      }

      const data = json.data!;
      if (!data.valid) {
        setPromoStatus("error");
        setPromoMessage(data.error ?? "Invalid coupon code");
        return;
      }

      // Coupon is valid — save to state and session
      setPromoCode(next);
      setDiscountAmountKes(data.discount?.amountKes ?? 0);
      setPromoMessage(data.message ?? "Coupon applied");
      setPromoStatus("valid");
      sessionStorage.setItem("fechi_promo", next);
    } catch {
      setPromoStatus("error");
      setPromoMessage("Failed to validate coupon — please try again");
    }
  }

  function removePromo() {
    setPromoCode("");
    setPromoInput("");
    setPromoStatus("idle");
    setPromoMessage("");
    setDiscountAmountKes(0);
    sessionStorage.removeItem("fechi_promo");
  }

  function handleCountryChange(next: string) {
    setCountry(next);
    setCounty("");
    setZoneId("");
    setState("");
    setStateText("");
    capture("delivery_country_selected", { country: next });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canContinue) return;

    setSubmitting(true);
    try {
      const deliveryData = {
        fullName: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        email,
        phone: phone as string,
        country,
        countryName: selectedCountry?.name ?? country,
        county: mode === "PICKUP" ? selectedStore.county : isKenya ? county : "",
        state: mode === "PICKUP" ? selectedStore.city : isKenya ? county : state || stateText,
        zoneId: mode === "DELIVERY" ? zoneId || null : null,
        deliveryZone: mode === "DELIVERY" ? selectedZone?.name ?? null : null,
        address,
        city: mode === "PICKUP" ? selectedStore.city : isKenya ? county : state || stateText,
        postalCode,
        notes,
        deliveryType: mode,
        branchId: mode === "PICKUP" ? selectedStore.branchId : selectedZone?.branchId ?? null,
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

  return (
    <div className="min-h-screen bg-[#f8f8f7] dark:bg-gray-950">
      <Navbar />
      <main className="mx-auto w-full max-w-[1180px] px-4 py-10 md:py-14">
        <div className="mb-8"><StepIndicator step={2} /></div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start">
          <section>
            <h1 className="mb-6 font-heading text-[32px] font-bold text-[#1a1c1c] dark:text-white">Delivery Details</h1>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-[10px] bg-[#f0f0ef] p-2">
              {(["DELIVERY", "PICKUP"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`flex h-10 items-center justify-center gap-2 rounded-[8px] text-[13px] font-bold transition-colors ${mode === value ? "bg-white text-[#0b6b13] shadow-sm" : "text-[#40493c]"}`}
                >
                  <Icon icon={value === "DELIVERY" ? "mdi:truck-delivery-outline" : "mdi:store-outline"} width={16} />
                  {value === "DELIVERY" ? "Home Delivery" : "Pickup from Store"}
                </button>
              ))}
            </div>

            <form id="delivery-details-form" onSubmit={handleSubmit} className="rounded-[12px] border border-[#dce4d8] bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="First Name"><input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Jane" /></Field>
                <Field label="Last Name"><input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Doe" /></Field>
                <PhoneInput label="Phone Number" value={phone} onChange={setPhone} />
                <Field label="Email Address"><input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" /></Field>
              </div>

              <div className="my-6 h-px bg-[#e6ebe3]" />

              {mode === "DELIVERY" ? (
                <div className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Country">
                      <div className="relative">
                        {selectedCountry?.flag?.startsWith("https://") && (
                          <Image src={selectedCountry.flag} alt="" width={22} height={16} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-[2px]" />
                        )}
                        <select disabled={countriesQuery.isLoading} className={`${inputClass} pl-12`} value={country} onChange={(e) => handleCountryChange(e.target.value)}>
                          {countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                        </select>
                      </div>
                    </Field>

                    {isKenya ? (
                      <Field label="County">
                        <select className={inputClass} value={county} onChange={(e) => { setCounty(e.target.value); setZoneId(""); }}>
                          <option value="">Select a county</option>
                          {KENYA_COUNTIES.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </Field>
                    ) : (
                      <Field label="State / Province">
                        {statesQuery.isLoading ? (
                          <div className="h-13 rounded-[8px] bg-[#eef4eb] animate-pulse" />
                        ) : stateFallback ? (
                          <input className={inputClass} value={stateText} onChange={(e) => setStateText(e.target.value)} placeholder="State or province" />
                        ) : (
                          <select className={inputClass} value={state} onChange={(e) => setState(e.target.value)}>
                            <option value="">Select state</option>
                            {stateOptions.map((item) => <option key={item.code || item.name} value={item.name}>{item.name}</option>)}
                          </select>
                        )}
                      </Field>
                    )}
                  </div>

                  {isKenya ? (
                    <Field label="Delivery Zone">
                      <select className={inputClass} value={zoneId} onChange={(e) => { setZoneId(e.target.value); capture("delivery_zone_selected", { zoneId: e.target.value }); }} disabled={!county || noZones || zonesQuery.isLoading}>
                        <option value="">{noZones ? "No delivery zones in this county - contact the store or pick another county." : zonesQuery.isLoading ? "Loading zones..." : "Select a delivery zone"}</option>
                        {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} - {formatKes(zone.deliveryFeeKes)}</option>)}
                      </select>
                    </Field>
                  ) : (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Address Line"><input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, building, apartment" /></Field>
                      <Field label="Zip / Postal Code"><input className={inputClass} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" /></Field>
                    </div>
                  )}

                  {isKenya && (
                    <Field label="Town / Estate / Building">
                      <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Westlands, The Mirage" />
                    </Field>
                  )}

                  <Field label="Delivery Notes (Optional)">
                    <textarea rows={4} className={`${inputClass} h-auto resize-none py-4`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any specific instructions for the rider?" />
                  </Field>
                </div>
              ) : (
                <div className="space-y-5">
                  <Field label="Store Location">
                    <select className={inputClass} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                      {PICKUP_STORES.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Additional Notes (Optional)">
                    <textarea rows={4} className={`${inputClass} h-auto resize-none py-4`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the store team should know?" />
                  </Field>
                </div>
              )}
            </form>
          </section>

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
                  <p className="text-[14px] font-bold text-[#1a1c1c] dark:text-white">{formatKes(item.lineTotalKes)}</p>
                </div>
              )) : <p className="text-sm text-[#40493c]">Your cart is empty.</p>}
            </div>

            {/* Coupon input — shows applied tag when valid, error text when invalid */}
            <div className="mt-6">
              {promoStatus === "valid" ? (
                <div className="flex items-center gap-2 rounded-[8px] border border-[#27731e] bg-[#f0fbed] px-4 py-3">
                  <Icon icon="mdi:tag-check-outline" width={16} className="shrink-0 text-[#27731e]" />
                  <span className="flex-1 text-[13px] font-bold text-[#27731e]">{promoMessage}</span>
                  <button
                    type="button"
                    onClick={removePromo}
                    aria-label="Remove coupon"
                    className="ml-2 text-[#27731e] hover:text-[#0b4a10]"
                  >
                    <Icon icon="mdi:close" width={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
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
              <SummaryRow label="Subtotal" value={formatKes(subtotalKes)} />
              <SummaryRow label={mode === "PICKUP" ? "Pickup" : "Delivery"} value={pricingQuery.isFetching ? "Calculating..." : feeKes ? formatKes(feeKes) : "Free"} />
              <SummaryRow label="Discount" value={`- ${formatKes(discountKes)}`} green />
            </div>

            <div className="my-6 h-px bg-[#e6ebe3]" />

            <div className="flex items-end justify-between">
              <span className="text-[22px] font-bold text-[#1a1c1c] dark:text-white">Total</span>
              <span className="text-[32px] font-black text-[#1a1c1c] dark:text-white">{formatKes(totalKes)}</span>
            </div>

            <button
              type="submit"
              form="delivery-details-form"
              disabled={!canContinue}
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
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${green ? "text-[#0b6b13]" : "text-[#40493c] dark:text-gray-300"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
