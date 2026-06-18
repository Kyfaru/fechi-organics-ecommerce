"use client";

import { AlertCircle } from "lucide-react";
import { forwardRef, InputHTMLAttributes } from "react";

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/**
 * Reusable labeled text input with integrated error state.
 *
 * - Label renders above the field in uppercase, tracking-widened style.
 * - On error: border turns red, AlertCircle icon + message appear below.
 * - Border radius: rounded-[20px] as per Figma spec.
 * - Passes all native <input> props through via forwardRef.
 */
const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold tracking-widest uppercase text-[#40493c] dark:text-gray-300"
        >
          {label}
        </label>

        <input
          ref={ref}
          id={inputId}
          className={[
            "w-full px-4 py-3 text-sm text-[#1a1c1c] dark:text-white bg-white dark:bg-gray-800",
            "rounded-[20px] border outline-none transition-colors duration-150",
            "placeholder:text-[rgba(64,73,60,0.5)] dark:placeholder:text-gray-500",
            "focus:border-[#27731e] focus:ring-2 focus:ring-[#27731e]/20",
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-200"
              : "border-[#c0cab8] dark:border-gray-600",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />

        {error && (
          <p
            id={`${inputId}-error`}
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

FormInput.displayName = "FormInput";

export default FormInput;
