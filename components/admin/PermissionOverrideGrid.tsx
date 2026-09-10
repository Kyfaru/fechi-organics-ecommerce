"use client";

/**
 * PermissionOverrideGrid — per-invite/per-staff-member permission narrowing.
 *
 * A role sets the ceiling; these checkboxes can only turn resources OFF for
 * one specific person, never grant beyond what their role already allows.
 * Resources the role doesn't grant at all render disabled — there is no way
 * to check a box the role itself doesn't have.
 */

import CheckboxGreen from "@/components/ui/CheckboxGreen";
import { appResources, grantsFor, type RoleName } from "@/lib/permissions";

function formatLabel(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function PermissionOverrideGrid({
  role,
  deny,
  onChange,
}: {
  role: RoleName;
  deny: string[];
  onChange: (deny: string[]) => void;
}) {
  function toggle(resource: string, allow: boolean) {
    onChange(allow ? deny.filter((r) => r !== resource) : [...deny, resource]);
  }

  return (
    <div>
      <p className="font-dm text-[13px] font-medium text-(--neutral-700) mb-1">Page access</p>
      <p className="font-dm text-[12px] text-(--neutral-400) mb-3">
        Uncheck any section this person shouldn&apos;t see. The {formatLabel(role)} role&apos;s own
        access is the ceiling — greyed-out sections aren&apos;t part of that role.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {appResources.map((resource) => {
          const granted = grantsFor(role, resource).length > 0;
          const checked = granted && !deny.includes(resource);
          return (
            <label
              key={resource}
              className={`flex items-center gap-2 ${granted ? "cursor-pointer" : "cursor-not-allowed"}`}
            >
              <CheckboxGreen
                checked={checked}
                disabled={!granted}
                onChange={(v) => toggle(resource, v)}
              />
              <span
                className={`font-dm text-[13px] ${
                  granted ? "text-(--neutral-700)" : "text-(--neutral-300)"
                }`}
              >
                {formatLabel(resource)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
