"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Navbar } from "@/components/layout/Navbar";
import { StepIndicator } from "@/components/checkout/StepIndicator";
import PhoneInput from "@/components/auth/PhoneInput";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { toast } from "@/lib/toast";
import { KENYA_COUNTIES } from "@/lib/kenya-counties";
import type { Value as PhoneValue } from "react-phone-number-input";

type BranchInfo = {
  id: string;
  name: string;
  county: string;
  mpesaType: "PAYBILL" | "TILL";
  shortcode: string;
} | null;

type DeliveryType = "PICKUP" | "DELIVERY";

export default function DeliveryPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState<PhoneValue | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [county, setCounty] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("DELIVERY");
  const [branchInfo, setBranchInfo] = useState<BranchInfo>(null);
  const [loadingBranch, setLoadingBranch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-fill name and email from session when available
  useEffect(() => {
    if (session?.user) {
      const u = session.user as Record<string, unknown>;
      const name =
        u.firstName && u.lastName
          ? `${u.firstName} ${u.lastName}`
          : ((u.name as string) ?? "");
      setFullName(name);
      setEmail((u.email as string) ?? "");
    }
  }, [session]);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [isPending, session, router]);

  // Fetch branch whenever county selection changes
  useEffect(() => {
    if (!county) {
      setBranchInfo(null);
      return;
    }
    setLoadingBranch(true);
    fetch(`/api/branches?county=${encodeURIComponent(county)}`)
      .then((r) => r.json())
      .then((data) => setBranchInfo(data.data ?? null))
      .catch(() => setBranchInfo(null))
      .finally(() => setLoadingBranch(false));
  }, [county]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Full name is required.";
    if (!phone) errs.phone = "Phone number is required.";
    if (!email.trim()) errs.email = "Email is required.";
    if (!county) errs.county = "Please select a county.";
    if (deliveryType === "DELIVERY" && !address.trim())
      errs.address = "Delivery address is required.";
    if (deliveryType === "DELIVERY" && !city.trim())
      errs.city = "City/town is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const deliveryData = {
        fullName,
        phone: phone as string,
        email,
        county,
        address: deliveryType === "DELIVERY" ? address : "",
        city: deliveryType === "DELIVERY" ? city : "",
        deliveryType,
        branchId:
          deliveryType === "PICKUP" && branchInfo ? branchInfo.id : null,
        branchName:
          deliveryType === "PICKUP" && branchInfo ? branchInfo.name : null,
      };
      sessionStorage.setItem("fechi_delivery", JSON.stringify(deliveryData));
      router.push("/payment");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isPending) {
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

  const inputClass =
    "w-full font-body text-[14px] text-[#1a1c1c] dark:text-white rounded-[8px] border border-[#c0cab8] dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 focus:outline-none focus:border-[#27731e] transition-colors placeholder:text-[#a1a1a1] dark:placeholder:text-gray-500";
  const labelClass =
    "block font-body text-[#40493c] dark:text-gray-300 text-[13px] font-semibold mb-1.5";

  return (
    <div className="min-h-screen bg-[#f9f9f9] dark:bg-gray-950">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Step indicator */}
        <div className="mb-8">
          <StepIndicator step={2} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-gray-900 rounded-[20px] border border-[#e2e2e2] dark:border-gray-700 p-6 shadow-sm"
        >
          <h1 className="font-heading font-bold text-[#1a1c1c] dark:text-white text-[24px] mb-1">
            Delivery Details
          </h1>
          <p className="text-sm text-[#40493c] dark:text-gray-400 mb-6">
            Where should we deliver your order?
          </p>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            {/* Full name */}
            <div>
              <label className={labelClass}>Full Name</label>
              <input
                type="text"
                className={inputClass}
                placeholder="Jane Wanjiru"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setErrors((p) => ({ ...p, fullName: "" }));
                }}
              />
              {errors.fullName && (
                <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <PhoneInput
                label="Phone Number"
                value={phone}
                onChange={(val) => {
                  setPhone(val);
                  setErrors((p) => ({ ...p, phone: "" }));
                }}
                error={errors.phone}
              />
            </div>

            {/* Email */}
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={inputClass}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((p) => ({ ...p, email: "" }));
                }}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email}</p>
              )}
            </div>

            {/* County */}
            <div>
              <label className={labelClass}>County</label>
              <select
                className={inputClass}
                value={county}
                onChange={(e) => {
                  setCounty(e.target.value);
                  setErrors((p) => ({ ...p, county: "" }));
                }}
              >
                <option value="">Select county</option>
                {KENYA_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.county && (
                <p className="text-red-500 text-xs mt-1">{errors.county}</p>
              )}
            </div>

            {/* Delivery method */}
            <div>
              <label className={labelClass}>Delivery Method</label>
              <div className="flex flex-col gap-3">
                {(
                  [
                    {
                      value: "DELIVERY" as DeliveryType,
                      label: "Home Delivery",
                      desc: "KES 350",
                      icon: "mdi:truck-delivery-outline",
                    },
                    {
                      value: "PICKUP" as DeliveryType,
                      label: "Pickup at Branch",
                      desc: "KES 130",
                      icon: "mdi:store-outline",
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-4 rounded-[12px] border cursor-pointer transition-colors ${
                      deliveryType === opt.value
                        ? "border-[#27731e] bg-[#27731e]/5"
                        : "border-[#e2e2e2] dark:border-gray-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="deliveryType"
                      value={opt.value}
                      checked={deliveryType === opt.value}
                      onChange={() => setDeliveryType(opt.value)}
                      className="accent-[#27731e]"
                    />
                    <Icon
                      icon={opt.icon}
                      width={20}
                      className="text-[#27731e]"
                    />
                    <div className="flex-1">
                      <span className="font-semibold text-[#1a1c1c] dark:text-white text-sm">
                        {opt.label}
                      </span>
                      <span className="ml-2 text-[#40493c] dark:text-gray-400 text-sm">
                        — {opt.desc}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Branch info panel — shown for pickup once a county is selected */}
            {deliveryType === "PICKUP" && county && (
              <div
                className={`rounded-[12px] border p-4 ${
                  loadingBranch
                    ? "border-[#e2e2e2]"
                    : branchInfo
                    ? "border-[#27731e]/30 bg-[#27731e]/5"
                    : "border-[#e2e2e2]"
                }`}
              >
                {loadingBranch ? (
                  <div className="flex items-center gap-2 text-sm text-[#40493c]">
                    <Icon
                      icon="mdi:loading"
                      width={16}
                      className="animate-spin"
                    />
                    Finding nearest branch…
                  </div>
                ) : branchInfo ? (
                  <div>
                    <p className="font-semibold text-[#1a1c1c] dark:text-white text-sm flex items-center gap-2">
                      <Icon
                        icon="mdi:map-marker"
                        width={16}
                        className="text-[#27731e]"
                      />
                      {branchInfo.name}
                    </p>
                    <p className="text-xs text-[#40493c] dark:text-gray-400 mt-1">
                      {branchInfo.mpesaType === "PAYBILL" ? "Paybill" : "Till"}{" "}
                      No: {branchInfo.shortcode} · Pickup fee: KES 130
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[#40493c] dark:text-gray-400">
                    No branch found for {county}. A Nairobi branch will be
                    used.
                  </p>
                )}
              </div>
            )}

            {/* Address fields — shown only for home delivery */}
            {deliveryType === "DELIVERY" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-4"
              >
                <div>
                  <label className={labelClass}>Street Address</label>
                  <textarea
                    className={`${inputClass} resize-none`}
                    rows={2}
                    placeholder="e.g. 14 Kenyatta Avenue, Apt 3B"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setErrors((p) => ({ ...p, address: "" }));
                    }}
                  />
                  {errors.address && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.address}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>City / Town</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g. Nairobi"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setErrors((p) => ({ ...p, city: "" }));
                    }}
                  />
                  {errors.city && (
                    <p className="text-red-500 text-xs mt-1">{errors.city}</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-full font-bold text-sm text-white bg-[#27731e] hover:bg-[#045a03] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting && (
                <Icon
                  icon="mdi:loading"
                  width={16}
                  className="animate-spin"
                />
              )}
              Continue to Payment
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
