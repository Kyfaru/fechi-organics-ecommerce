"use client";

import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { forwardRef, InputHTMLAttributes, useState } from "react";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string;
}

/**
 * Password field with show/hide toggle (Eye / EyeOff icons from lucide-react).
 *
 * The input type toggles between "password" (masked) and "text" (visible).
 * All other props mirror FormInput — same border radius, error state, label style.
 */
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold tracking-widest uppercase text-[#40493c]"
        >
          {label}
        </label>

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={showPassword ? "text" : "password"}
            className={[
              "w-full px-4 py-3 pr-11 text-sm text-[#1a1c1c] bg-white",
              "rounded-[20px] border outline-none transition-colors duration-150",
              "placeholder:text-[rgba(64,73,60,0.5)]",
              "focus:border-[#27731e] focus:ring-2 focus:ring-[#27731e]/20",
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-200"
                : "border-[#c0cab8]",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />

          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#40493c] hover:text-[#27731e] transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

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

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;
