"use client";

import { Icon } from "@iconify/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Requirement {
  label: string;
  met: boolean;
}

interface PasswordChecklistProps {
  /** The current password value being checked. */
  password: string;
  /** Controls visibility — parent shows this when the password field is focused. */
  visible: boolean;
  /**
   * When true, unmet requirements are shown with a red X instead of a neutral
   * gray dash. Pass true after the form has been submitted with errors.
   */
  submitted?: boolean;
}

// ---------------------------------------------------------------------------
// Requirements checker (exported so the signup page can reuse it for validation)
// ---------------------------------------------------------------------------

export function checkRequirements(pw: string): Requirement[] {
  return [
    {
      label: "At least 8 characters",
      met: pw.length >= 8,
    },
    {
      label: "At least 2 letters",
      met: (pw.match(/[a-zA-Z]/g) ?? []).length >= 2,
    },
    {
      label: "At least 2 numbers",
      met: (pw.match(/[0-9]/g) ?? []).length >= 2,
    },
    {
      label: "At least 1 special character (!@#$… etc.)",
      met: /[^a-zA-Z0-9]/.test(pw),
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PasswordChecklist({
  password,
  visible,
  submitted = false,
}: PasswordChecklistProps) {
  // Hidden entirely when not visible — no layout shift
  if (!visible) return null;

  const requirements = checkRequirements(password);

  return (
    <div
      className="mt-2 p-4 bg-[#f9f9f9] border border-[#c0cab8] rounded-xl"
      role="status"
      aria-live="polite"
      aria-label="Password requirements"
    >
      <p className="text-[11px] font-semibold tracking-widest uppercase text-[#40493c] mb-2.5">
        Password must include
      </p>
      <ul className="flex flex-col gap-1.5" role="list">
        {requirements.map((req) => {
          // Determine visual state
          const isError = submitted && !req.met;
          const color = req.met ? "#16a34a" : isError ? "#ef4444" : "#9ca3af";
          const icon = req.met
            ? "solar:check-circle-bold"
            : isError
            ? "solar:close-circle-bold"
            : "solar:minus-circle-linear";

          return (
            <li key={req.label} className="flex items-center gap-2">
              <Icon
                icon={icon}
                width={15}
                height={15}
                color={color}
                className="shrink-0"
              />
              <span className="text-xs" style={{ color }}>
                {req.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
