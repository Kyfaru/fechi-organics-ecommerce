"use client";

import { AlertCircle } from "lucide-react";
import { forwardRef, SelectHTMLAttributes } from "react";

interface CountrySelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

/** ISO 3166-1 alpha-2 country list (abridged for brevity — full list in prod). */
const COUNTRIES: { code: string; name: string }[] = [
  { code: "", name: "Select country" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "JP", name: "Japan" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "GH", name: "Ghana" },
  { code: "UG", name: "Uganda" },
  { code: "TZ", name: "Tanzania" },
  { code: "EG", name: "Egypt" },
  { code: "MA", name: "Morocco" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "NZ", name: "New Zealand" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "RU", name: "Russia" },
  { code: "UA", name: "Ukraine" },
  { code: "TR", name: "Turkey" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IL", name: "Israel" },
  { code: "IR", name: "Iran" },
  { code: "OM", name: "Oman" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
];

/**
 * Native <select> styled to match Figma design tokens.
 * Uses forwardRef so it integrates with react-hook-form register().
 */
const CountrySelect = forwardRef<HTMLSelectElement, CountrySelectProps>(
  ({ label = "COUNTRY", error, className = "", id, ...props }, ref) => {
    const selectId = id ?? "country";

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={selectId}
          className="text-xs font-semibold tracking-widest uppercase text-[#40493c] dark:text-gray-300"
        >
          {label}
        </label>

        <select
          ref={ref}
          id={selectId}
          className={[
            "w-full px-4 py-3 text-sm text-[#1a1c1c] dark:text-white bg-white dark:bg-gray-800 appearance-none",
            "rounded-[20px] border outline-none transition-colors duration-150",
            "focus:border-[#27731e] focus:ring-2 focus:ring-[#27731e]/20",
            "cursor-pointer",
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-200"
              : "border-[#c0cab8] dark:border-gray-600",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${selectId}-error` : undefined}
          {...props}
        >
          {COUNTRIES.map(({ code, name }) => (
            <option key={code} value={code} disabled={code === ""}>
              {name}
            </option>
          ))}
        </select>

        {error && (
          <p
            id={`${selectId}-error`}
            role="alert"
            className="flex items-center gap-1.5 text-xs text-red-500"
          >
            <AlertCircle size={13} className="shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

CountrySelect.displayName = "CountrySelect";

export default CountrySelect;
