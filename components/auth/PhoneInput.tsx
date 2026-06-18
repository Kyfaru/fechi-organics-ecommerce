"use client";

import { AlertCircle } from "lucide-react";
import ReactPhoneInput, { type Value } from "react-phone-number-input";
import "react-phone-number-input/style.css";

interface PhoneInputProps {
  label?: string;
  value: Value | undefined;
  onChange: (value: Value | undefined) => void;
  error?: string;
  id?: string;
}

/**
 * Phone number input with country-code flag selector.
 * Wraps react-phone-number-input with matching Figma design tokens.
 *
 * The library injects its own flag/select styles via the imported CSS;
 * we override the input portion to match the rest of the form.
 *
 * Note: react-phone-number-input does not support external ref forwarding in
 * a type-safe way, so this component does not forward a ref. If ref access
 * to the underlying <input> is needed, use the `inputComponent` prop.
 */
export default function PhoneInput({
  label = "PHONE NUMBER",
  value,
  onChange,
  error,
  id = "phone",
}: PhoneInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold tracking-widest uppercase text-[#40493c] dark:text-gray-300"
      >
        {label}
      </label>

      <div
        className={[
          "flex items-center w-full px-4 py-3 bg-white dark:bg-gray-800",
          "rounded-[20px] border transition-colors duration-150",
          "focus-within:border-[#27731e] focus-within:ring-2 focus-within:ring-[#27731e]/20",
          error
            ? "border-red-500 focus-within:border-red-500 focus-within:ring-red-200"
            : "border-[#c0cab8] dark:border-gray-600",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ReactPhoneInput
          id={id}
          value={value}
          onChange={onChange}
          defaultCountry="KE"
          international
          countryCallingCodeEditable={false}
          className="w-full text-sm text-[#1a1c1c] dark:text-white phone-input dark:bg-gray-800"
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>

      {error && (
        <p
          id={`${id}-error`}
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
