"use client";

import { AlertCircle } from "lucide-react";
import { forwardRef, SelectHTMLAttributes } from "react";

interface CountrySelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

/** ISO 3166-1 alpha-2 country list (abridged for brevity — full list in prod). */
const COUNTRIES: { code: string; name: string }[] = [
  // =========================
// SELECT COUNTRY
// =========================

{ code: "", name: "Select country" },


// =========================
// AFRICA
// =========================

{ code: "DZ", name: "Algeria" },
{ code: "AO", name: "Angola" },
{ code: "BJ", name: "Benin" },
{ code: "BW", name: "Botswana" },
{ code: "BF", name: "Burkina Faso" },
{ code: "BI", name: "Burundi" },
{ code: "CV", name: "Cabo Verde" },
{ code: "CM", name: "Cameroon" },
{ code: "CF", name: "Central African Republic" },
{ code: "TD", name: "Chad" },
{ code: "KM", name: "Comoros" },
{ code: "CG", name: "Republic of the Congo" },
{ code: "CD", name: "Democratic Republic of the Congo" },
{ code: "CI", name: "Côte d'Ivoire" },
{ code: "DJ", name: "Djibouti" },
{ code: "EG", name: "Egypt" },
{ code: "GQ", name: "Equatorial Guinea" },
{ code: "ER", name: "Eritrea" },
{ code: "SZ", name: "Eswatini" },
{ code: "ET", name: "Ethiopia" },
{ code: "GA", name: "Gabon" },
{ code: "GM", name: "Gambia" },
{ code: "GH", name: "Ghana" },
{ code: "GN", name: "Guinea" },
{ code: "GW", name: "Guinea-Bissau" },
{ code: "KE", name: "Kenya" },
{ code: "LS", name: "Lesotho" },
{ code: "LR", name: "Liberia" },
{ code: "LY", name: "Libya" },
{ code: "MG", name: "Madagascar" },
{ code: "MW", name: "Malawi" },
{ code: "ML", name: "Mali" },
{ code: "MR", name: "Mauritania" },
{ code: "MU", name: "Mauritius" },
{ code: "MA", name: "Morocco" },
{ code: "MZ", name: "Mozambique" },
{ code: "NA", name: "Namibia" },
{ code: "NE", name: "Niger" },
{ code: "NG", name: "Nigeria" },
{ code: "RW", name: "Rwanda" },
{ code: "ST", name: "São Tomé and Príncipe" },
{ code: "SN", name: "Senegal" },
{ code: "SC", name: "Seychelles" },
{ code: "SL", name: "Sierra Leone" },
{ code: "SO", name: "Somalia" },
{ code: "ZA", name: "South Africa" },
{ code: "SS", name: "South Sudan" },
{ code: "SD", name: "Sudan" },
{ code: "TZ", name: "Tanzania" },
{ code: "TG", name: "Togo" },
{ code: "TN", name: "Tunisia" },
{ code: "UG", name: "Uganda" },
{ code: "ZM", name: "Zambia" },
{ code: "ZW", name: "Zimbabwe" },


// =========================
// ASIA
// =========================

{ code: "AF", name: "Afghanistan" },
{ code: "AM", name: "Armenia" },
{ code: "AZ", name: "Azerbaijan" },
{ code: "BH", name: "Bahrain" },
{ code: "BD", name: "Bangladesh" },
{ code: "BT", name: "Bhutan" },
{ code: "BN", name: "Brunei" },
{ code: "KH", name: "Cambodia" },
{ code: "CN", name: "China" },
{ code: "CY", name: "Cyprus" },
{ code: "GE", name: "Georgia" },
{ code: "IN", name: "India" },
{ code: "ID", name: "Indonesia" },
{ code: "IR", name: "Iran" },
{ code: "IQ", name: "Iraq" },
{ code: "IL", name: "Israel" },
{ code: "JP", name: "Japan" },
{ code: "JO", name: "Jordan" },
{ code: "KZ", name: "Kazakhstan" },
{ code: "KW", name: "Kuwait" },
{ code: "KG", name: "Kyrgyzstan" },
{ code: "LA", name: "Laos" },
{ code: "LB", name: "Lebanon" },
{ code: "MY", name: "Malaysia" },
{ code: "MV", name: "Maldives" },
{ code: "MN", name: "Mongolia" },
{ code: "MM", name: "Myanmar" },
{ code: "NP", name: "Nepal" },
{ code: "KP", name: "North Korea" },
{ code: "OM", name: "Oman" },
{ code: "PK", name: "Pakistan" },
{ code: "PS", name: "Palestine" },
{ code: "PH", name: "Philippines" },
{ code: "QA", name: "Qatar" },
{ code: "SA", name: "Saudi Arabia" },
{ code: "SG", name: "Singapore" },
{ code: "KR", name: "South Korea" },
{ code: "LK", name: "Sri Lanka" },
{ code: "SY", name: "Syria" },
{ code: "TJ", name: "Tajikistan" },
{ code: "TH", name: "Thailand" },
{ code: "TL", name: "Timor-Leste" },
{ code: "TR", name: "Turkey" },
{ code: "TM", name: "Turkmenistan" },
{ code: "AE", name: "United Arab Emirates" },
{ code: "UZ", name: "Uzbekistan" },
{ code: "VN", name: "Vietnam" },
{ code: "YE", name: "Yemen" },


// =========================
// EUROPE
// =========================

{ code: "AL", name: "Albania" },
{ code: "AD", name: "Andorra" },
{ code: "AT", name: "Austria" },
{ code: "BY", name: "Belarus" },
{ code: "BE", name: "Belgium" },
{ code: "BA", name: "Bosnia and Herzegovina" },
{ code: "BG", name: "Bulgaria" },
{ code: "HR", name: "Croatia" },
{ code: "CZ", name: "Czechia" },
{ code: "DK", name: "Denmark" },
{ code: "EE", name: "Estonia" },
{ code: "FI", name: "Finland" },
{ code: "FR", name: "France" },
{ code: "DE", name: "Germany" },
{ code: "GR", name: "Greece" },
{ code: "HU", name: "Hungary" },
{ code: "IS", name: "Iceland" },
{ code: "IE", name: "Ireland" },
{ code: "IT", name: "Italy" },
{ code: "LV", name: "Latvia" },
{ code: "LI", name: "Liechtenstein" },
{ code: "LT", name: "Lithuania" },
{ code: "LU", name: "Luxembourg" },
{ code: "MT", name: "Malta" },
{ code: "MD", name: "Moldova" },
{ code: "MC", name: "Monaco" },
{ code: "ME", name: "Montenegro" },
{ code: "NL", name: "Netherlands" },
{ code: "MK", name: "North Macedonia" },
{ code: "NO", name: "Norway" },
{ code: "PL", name: "Poland" },
{ code: "PT", name: "Portugal" },
{ code: "RO", name: "Romania" },
{ code: "RU", name: "Russia" },
{ code: "SM", name: "San Marino" },
{ code: "RS", name: "Serbia" },
{ code: "SK", name: "Slovakia" },
{ code: "SI", name: "Slovenia" },
{ code: "ES", name: "Spain" },
{ code: "SE", name: "Sweden" },
{ code: "CH", name: "Switzerland" },
{ code: "UA", name: "Ukraine" },
{ code: "GB", name: "United Kingdom" },
{ code: "VA", name: "Vatican City" },


// =========================
// NORTH AMERICA
// =========================

{ code: "AG", name: "Antigua and Barbuda" },
{ code: "BS", name: "Bahamas" },
{ code: "BB", name: "Barbados" },
{ code: "BZ", name: "Belize" },
{ code: "CA", name: "Canada" },
{ code: "CR", name: "Costa Rica" },
{ code: "CU", name: "Cuba" },
{ code: "DM", name: "Dominica" },
{ code: "DO", name: "Dominican Republic" },
{ code: "SV", name: "El Salvador" },
{ code: "GD", name: "Grenada" },
{ code: "GT", name: "Guatemala" },
{ code: "HT", name: "Haiti" },
{ code: "HN", name: "Honduras" },
{ code: "JM", name: "Jamaica" },
{ code: "MX", name: "Mexico" },
{ code: "NI", name: "Nicaragua" },
{ code: "PA", name: "Panama" },
{ code: "KN", name: "Saint Kitts and Nevis" },
{ code: "LC", name: "Saint Lucia" },
{ code: "VC", name: "Saint Vincent and the Grenadines" },
{ code: "TT", name: "Trinidad and Tobago" },
{ code: "US", name: "United States" },


// =========================
// SOUTH AMERICA
// =========================

{ code: "AR", name: "Argentina" },
{ code: "BO", name: "Bolivia" },
{ code: "BR", name: "Brazil" },
{ code: "CL", name: "Chile" },
{ code: "CO", name: "Colombia" },
{ code: "EC", name: "Ecuador" },
{ code: "GY", name: "Guyana" },
{ code: "PY", name: "Paraguay" },
{ code: "PE", name: "Peru" },
{ code: "SR", name: "Suriname" },
{ code: "UY", name: "Uruguay" },
{ code: "VE", name: "Venezuela" },


// =========================
// OCEANIA / AUSTRALIA
// =========================

{ code: "AU", name: "Australia" },
{ code: "FJ", name: "Fiji" },
{ code: "KI", name: "Kiribati" },
{ code: "MH", name: "Marshall Islands" },
{ code: "FM", name: "Micronesia" },
{ code: "NR", name: "Nauru" },
{ code: "NZ", name: "New Zealand" },
{ code: "PW", name: "Palau" },
{ code: "PG", name: "Papua New Guinea" },
{ code: "WS", name: "Samoa" },
{ code: "SB", name: "Solomon Islands" },
{ code: "TO", name: "Tonga" },
{ code: "TV", name: "Tuvalu" },
{ code: "VU", name: "Vanuatu" },


// =========================
// ANTARCTICA
// =========================

// Antarctica has no sovereign countries.
// If your application needs an Antarctica option,
// use its ISO code:

{ code: "AQ", name: "Antarctica" },
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
