"use client";

import { Icon } from "@iconify/react";
import PasswordInput from "@/components/auth/PasswordInput";
import { checkRequirements } from "@/components/auth/PasswordChecklist";

interface StrongPasswordInputProps {
  password: string;
  confirmPassword: string;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  disabled?: boolean;
  /** Shows unmet requirements in red instead of neutral gray. */
  submitted?: boolean;
  passwordLabel?: string;
  confirmLabel?: string;
}

type Level = "empty" | "weak" | "medium" | "strong" | "very-strong";

const LEVEL_META: Record<Level, { label: string; barColor: string; textColor: string }> = {
  empty: { label: "Empty", barColor: "bg-gray-200 dark:bg-gray-700", textColor: "text-gray-400" },
  weak: { label: "Weak", barColor: "bg-red-500", textColor: "text-red-500" },
  medium: { label: "Medium", barColor: "bg-yellow-500", textColor: "text-yellow-600" },
  strong: { label: "Strong", barColor: "bg-green-400", textColor: "text-green-600" },
  "very-strong": { label: "Very Strong", barColor: "bg-green-700", textColor: "text-green-700" },
};

function getLevel(password: string): Level {
  if (password.length === 0) return "empty";
  const metCount = checkRequirements(password).filter((r) => r.met).length;
  if (metCount <= 1) return "weak";
  if (metCount === 2) return "medium";
  if (metCount === 3) return "strong";
  return "very-strong";
}

/**
 * Two-field password entry (new + confirm) with a 4-segment colored strength
 * bar under the new-password field and one combined requirements checklist
 * below both fields — the confirm field gets no bar of its own, just an
 * extra "Matches new password" row in the shared checklist.
 */
export default function StrongPasswordInput({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  disabled = false,
  submitted = false,
  passwordLabel = "New Password",
  confirmLabel = "Confirm Password",
}: StrongPasswordInputProps) {
  const level = getLevel(password);
  const requirements = checkRequirements(password);
  const activeSegments = level === "empty" ? 0 : ["weak", "medium", "strong", "very-strong"].indexOf(level) + 1;
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <PasswordInput
          label={passwordLabel}
          placeholder="Enter a new password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="new-password"
          disabled={disabled}
        />
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < activeSegments ? LEVEL_META[level].barColor : "bg-gray-200 dark:bg-gray-700"
              }`}
            />
          ))}
        </div>
        <p className={`text-xs font-medium ${LEVEL_META[level].textColor}`}>
          Level: {LEVEL_META[level].label}
        </p>
      </div>

      <PasswordInput
        label={confirmLabel}
        placeholder="Re-enter your new password"
        value={confirmPassword}
        onChange={(e) => onConfirmPasswordChange(e.target.value)}
        autoComplete="new-password"
        disabled={disabled}
      />

      <div className="p-4 bg-[#f9f9f9] dark:bg-gray-800/60 border border-[#c0cab8] dark:border-gray-700 rounded-xl">
        <p className="text-[11px] font-semibold tracking-widest uppercase text-[#40493c] dark:text-gray-400 mb-2.5">
          Your password must contain
        </p>
        <ul className="flex flex-col gap-1.5">
          {[...requirements.map((r) => ({ label: r.label, met: r.met })), { label: "Matches new password", met: passwordsMatch }].map(
            (req) => {
              const isError = submitted && !req.met;
              const color = req.met ? "#16a34a" : isError ? "#ef4444" : "#9ca3af";
              const icon = req.met
                ? "solar:check-circle-bold"
                : isError
                ? "solar:close-circle-bold"
                : "solar:minus-circle-linear";
              return (
                <li key={req.label} className="flex items-center gap-2">
                  <Icon icon={icon} width={15} height={15} color={color} className="shrink-0" />
                  <span className="text-xs" style={{ color }}>
                    {req.label}
                  </span>
                </li>
              );
            }
          )}
        </ul>
      </div>
    </div>
  );
}
