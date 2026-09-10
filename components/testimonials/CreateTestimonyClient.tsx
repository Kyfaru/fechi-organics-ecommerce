"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import type { Value as PhoneValue } from "react-phone-number-input";
import FormInput from "@/components/auth/FormInput";
import PhoneInput from "@/components/ui/PhoneInput";
import CountrySelect, { type CountryItem } from "@/components/account/profile/CountrySelect";
import CitySelect from "@/components/account/profile/CitySelect";
import ProductMultiSelect from "@/components/ui/ProductMultiSelect";
import StarRatingInput from "@/components/ui/StarRatingInput";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";

type Step = 1 | 2 | 3;

const STEP_COPY: Record<Step, { title: string; description: string }> = {
  1: { title: "Your Details", description: "Tell us a little about yourself so we can credit your story." },
  2: { title: "Your Experience", description: "Which products did you use, and how did they work for you?" },
  3: { title: "Confirm & Submit", description: "Review everything below before sending your testimony." },
};

function PhotoSlot({
  label,
  previewUrl,
  uploading,
  onSelect,
  onRemove,
}: {
  label: string;
  previewUrl: string | null;
  uploading: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const inputId = `photo-${label.toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold tracking-widest uppercase text-[#40493c] dark:text-gray-300">
        {label} photo (optional)
      </label>
      {previewUrl ? (
        <div className="relative w-full h-36 rounded-xl overflow-hidden border border-[#c0cab8] dark:border-gray-600">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
            aria-label={`Remove ${label} photo`}
          >
            <Icon icon="mdi:close" width={16} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="w-full h-36 rounded-xl border-2 border-dashed border-[#c0cab8] dark:border-gray-600 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#27731e] transition-colors text-[#40493c] dark:text-gray-400"
        >
          {uploading ? (
            <Spinner size={20} />
          ) : (
            <>
              <Icon icon="mdi:image-plus-outline" width={26} />
              <span className="text-xs">Add a photo</span>
            </>
          )}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSelect(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

export function CreateTestimonyClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [countries, setCountries] = useState<CountryItem[]>([]);

  useEffect(() => {
    fetch("/api/countries")
      .then((r) => r.json())
      .then((data) => setCountries(data?.data?.countries ?? []))
      .catch(() => {});
  }, []);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState<PhoneValue | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [county, setCounty] = useState("");

  // Step 2
  const [productIds, setProductIds] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [quote, setQuote] = useState("");
  const [beforeKey, setBeforeKey] = useState<string | null>(null);
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [beforeUploading, setBeforeUploading] = useState(false);
  const [afterKey, setAfterKey] = useState<string | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);
  const [afterUploading, setAfterUploading] = useState(false);

  const step1Valid = firstName.trim().length >= 2 && lastName.trim().length >= 2 && !!phone && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !!country && !!county;
  const step2Valid = rating > 0 && quote.trim().length >= 10;

  async function uploadPhoto(
    file: File,
    setKey: (k: string | null) => void,
    setPreview: (u: string | null) => void,
    setUploading: (b: boolean) => void
  ) {
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/testimonials/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json?.error ?? "Photo upload failed");
        setPreview(null);
        return;
      }
      setKey(json.objectKey);
    } catch {
      toast.error("Photo upload failed. Please try again.");
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: `${firstName.trim()} ${lastName.trim()}`,
          contactEmail: email.trim(),
          contactPhone: phone,
          location: `${county}, ${country}`,
          productIds,
          rating,
          quote: quote.trim(),
          beforeKey: beforeKey ?? undefined,
          afterKey: afterKey ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json?.error?.message ?? "Could not submit your testimony. Please try again.");
        return;
      }
      toast.success("Thank you! Your testimony has been submitted for review.");
      router.push("/testimonials");
    } catch {
      toast.error("Could not submit your testimony. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Hero header */}
      <section className="bg-white dark:bg-gray-950 px-4 md:px-8 pt-10 pb-8 text-center transition-colors">
        <p className="font-body text-[#40493c] dark:text-gray-400 text-[12px] md:text-[13px] tracking-[1.5px] uppercase mb-3">
          Share Your Story
        </p>
        <h1 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-[36px] md:text-[52px] tracking-[-1px] leading-tight">
          Tell Us About Your Experience
        </h1>
      </section>

    <section className="px-4 md:px-8 py-10 md:py-16 bg-[#f9f9f9] dark:bg-gray-900">
      <div className="max-w-2xl mx-auto bg-white dark:bg-gray-950 rounded-[20px] p-6 md:p-10 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-none dark:border dark:border-gray-800">
        {/* Stepper header */}
        <div className="flex items-center justify-center gap-3 mb-10">
          {([1, 2, 3] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  s === step
                    ? "bg-[#27731e] border-[#27731e] text-white"
                    : s < step
                    ? "bg-[#e8f3e6] border-[#27731e] text-[#27731e]"
                    : "bg-white dark:bg-gray-800 border-[#c0cab8] dark:border-gray-600 text-[#40493c] dark:text-gray-400"
                }`}
              >
                {s < step ? <Icon icon="mdi:check" width={18} /> : s}
              </div>
              {i < 2 && (
                <div className={`w-10 h-0.5 ${s < step ? "bg-[#27731e]" : "bg-[#c0cab8] dark:bg-gray-600"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="text-center mb-8">
          <h1 className="font-heading font-semibold text-[#1a1c1c] dark:text-white text-2xl md:text-3xl mb-2">
            {STEP_COPY[step].title}
          </h1>
          <p className="font-body text-[#40493c] dark:text-gray-400 text-sm">{STEP_COPY[step].description}</p>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormInput label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Jane" />
            <FormInput label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Doe" />
            <PhoneInput label="Phone Number" value={phone} onChange={setPhone} />
            <FormInput label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            <CountrySelect
              value={country}
              onChange={(name) => {
                setCountry(name);
                setCounty("");
              }}
              countries={countries}
            />
            <CitySelect value={county} onChange={setCounty} country={country} />
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-[#40493c] dark:text-gray-300 mb-1.5 block">
                Products you used
              </label>
              <ProductMultiSelect value={productIds} onChange={setProductIds} />
            </div>

            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-[#40493c] dark:text-gray-300 mb-1.5 block">
                Your rating
              </label>
              <StarRatingInput value={rating} onChange={setRating} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="quote" className="text-xs font-semibold tracking-widest uppercase text-[#40493c] dark:text-gray-300">
                Your testimony
              </label>
              <textarea
                id="quote"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                rows={5}
                placeholder="Tell us about your experience..."
                className="w-full px-4 py-3 text-sm text-[#1a1c1c] dark:text-white bg-white dark:bg-gray-800 rounded-[20px] border border-[#c0cab8] dark:border-gray-600 outline-none focus:border-[#27731e] focus:ring-2 focus:ring-[#27731e]/20 resize-none transition-colors"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <PhotoSlot
                label="Before"
                previewUrl={beforePreview}
                uploading={beforeUploading}
                onSelect={(f) => uploadPhoto(f, setBeforeKey, setBeforePreview, setBeforeUploading)}
                onRemove={() => {
                  setBeforeKey(null);
                  setBeforePreview(null);
                }}
              />
              <PhotoSlot
                label="After"
                previewUrl={afterPreview}
                uploading={afterUploading}
                onSelect={(f) => uploadPhoto(f, setAfterKey, setAfterPreview, setAfterUploading)}
                onRemove={() => {
                  setAfterKey(null);
                  setAfterPreview(null);
                }}
              />
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-[#e6ebe3] dark:border-gray-700 divide-y divide-[#e6ebe3] dark:divide-gray-700">
              <SummaryRow label="Name" value={`${firstName} ${lastName}`} />
              <SummaryRow label="Contact" value={`${phone ?? "—"} · ${email}`} />
              <SummaryRow label="Location" value={`${county}, ${country}`} />
              <SummaryRow label="Rating" value={`${rating} / 5`} />
              <SummaryRow label="Testimony" value={quote} />
            </div>
            {(beforePreview || afterPreview) && (
              <div className="grid grid-cols-2 gap-4">
                {beforePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={beforePreview} alt="Before" className="w-full h-32 object-cover rounded-xl" />
                )}
                {afterPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={afterPreview} alt="After" className="w-full h-32 object-cover rounded-xl" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between mt-10">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="inline-flex items-center gap-2 font-body font-semibold text-[#1a1c1c] dark:text-white px-6 py-3 rounded-full border border-[#c0cab8] dark:border-gray-600 hover:bg-[#f0fdf4] dark:hover:bg-gray-800 transition-colors"
            >
              <Icon icon="mdi:arrow-left" width={18} />
              Back
            </button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 ? !step1Valid : !step2Valid}
              onClick={() => setStep((s) => (s + 1) as Step)}
              className="inline-flex items-center gap-2 bg-[#27731e] text-white font-body font-semibold px-7 py-3 rounded-full hover:bg-[#045a03] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
              <Icon icon="mdi:arrow-right" width={18} />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 bg-[#fec700] text-[#1a1c1c] font-body font-semibold px-7 py-3 rounded-full hover:brightness-95 transition-all disabled:opacity-50"
            >
              {submitting ? <Spinner size={16} /> : "Submit Testimony"}
            </button>
          )}
        </div>
      </div>
    </section>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#40493c]/60 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-[#1a1c1c] dark:text-white">{value}</p>
    </div>
  );
}
