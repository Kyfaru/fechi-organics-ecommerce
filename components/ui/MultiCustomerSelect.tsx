"use client";

/**
 * MultiCustomerSelect — controlled multi-select with search for campaign audience targeting.
 *
 * Behavior:
 *   - Input area shows selected customers as green pills (name + red × to remove).
 *   - Clicking the input area opens a dropdown.
 *   - Dropdown: search bar (Search icon) then customer list.
 *   - Selected customers shown at top with CheckboxGreen checked=true.
 *   - Unselected customers below in ascending alphabetical order with CheckboxGreen checked=false.
 *   - Clicking a customer toggles selection (calls onChange).
 *   - Minimum 1 selected: clicking the only selected customer does nothing.
 *   - Escape closes dropdown.
 *   - Click outside closes dropdown (useRef + useEffect).
 *
 * No Preline JS / external dropdown library — pure React.
 *
 * Props: { customers, value, onChange, placeholder?, className? }
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import CheckboxGreen from "@/components/ui/CheckboxGreen";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CustomerOption {
  id: string;
  name: string;
  email: string;
  image?: string;
}

export interface MultiCustomerSelectProps {
  customers: CustomerOption[];
  /** Array of selected customer IDs */
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Small helper — customer initials avatar
// ---------------------------------------------------------------------------
function Avatar({ customer }: { customer: CustomerOption }) {
  const initials = customer.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return customer.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={customer.image}
      alt={customer.name}
      className="w-8 h-8 rounded-full object-cover shrink-0"
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-green-100 text-green-800 flex items-center justify-center text-[11px] font-semibold shrink-0 font-dm">
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MultiCustomerSelect({
  customers,
  value,
  onChange,
  placeholder = "Select customers…",
  className = "",
}: MultiCustomerSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Outside-click detection ──────────────────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // ── Keyboard: Escape closes ──────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      // Auto-focus search when dropdown opens
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // ── Toggle selection ─────────────────────────────────────────────────────
  const toggle = useCallback(
    (id: string) => {
      const isSelected = value.includes(id);
      // Enforce minimum 1 selected
      if (isSelected && value.length <= 1) return;
      const next = isSelected ? value.filter((x) => x !== id) : [...value, id];
      onChange(next);
    },
    [value, onChange],
  );

  // ── Derived data ─────────────────────────────────────────────────────────
  const selectedCustomers = customers.filter((c) => value.includes(c.id));

  const filteredCustomers = customers.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  // Partition into selected-first then rest (both sorted alphabetically within each group)
  const displayList = [
    ...filteredCustomers
      .filter((c) => value.includes(c.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ...filteredCustomers
      .filter((c) => !value.includes(c.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input area */}
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={`
          min-h-[42px] w-full px-3 py-2 flex flex-wrap gap-1.5 items-center
          rounded-[8px] border cursor-pointer
          border-[var(--neutral-300,#d1d5db)] dark:border-[var(--dark-border,#374151)]
          bg-white dark:bg-[var(--dark-surface,#1f2937)]
          focus:outline-none focus:border-green-600
          transition-colors
          ${open ? "border-green-600" : ""}
        `}
      >
        {/* Selected pills */}
        {selectedCustomers.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500 text-white text-[12px] font-dm font-medium"
          >
            {c.name}
            {/* Remove button — stopPropagation so it doesn't re-open the dropdown */}
            <button
              type="button"
              aria-label={`Remove ${c.name}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(c.id);
              }}
              className="ml-0.5 text-red-400 dark:text-black hover:text-red-200 dark:hover:text-gray-700 transition-colors leading-none"
            >
              <X size={11} />
            </button>
          </span>
        ))}

        {/* Placeholder when nothing selected */}
        {selectedCustomers.length === 0 && (
          <span className="font-dm text-[14px] text-[var(--neutral-400,#9ca3af)]">
            {placeholder}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className={`
            absolute z-50 mt-1 w-full
            bg-white dark:bg-[var(--dark-surface,#1f2937)]
            border border-[var(--neutral-200,#e5e7eb)] dark:border-[var(--dark-border,#374151)]
            rounded-[10px] shadow-lg
            max-h-[300px] overflow-hidden flex flex-col
          `}
          role="listbox"
          aria-multiselectable="true"
        >
          {/* Search bar */}
          <div className="px-3 pt-3 pb-2 border-b border-[var(--neutral-100,#f3f4f6)] dark:border-[var(--dark-border,#374151)] shrink-0">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--neutral-400,#9ca3af)] pointer-events-none"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers…"
                className={`
                  w-full h-9 pl-8 pr-3
                  rounded-[6px] border border-[var(--neutral-200,#e5e7eb)] dark:border-[var(--dark-border,#374151)]
                  bg-[var(--neutral-50,#f9fafb)] dark:bg-[var(--dark-bg,#111827)]
                  font-dm text-[13px] text-[var(--neutral-900,#111827)] dark:text-[var(--dark-text,#f9fafb)]
                  outline-none focus:border-green-500
                  placeholder:text-[var(--neutral-400,#9ca3af)]
                  transition-colors
                `}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Customer list */}
          <div className="overflow-y-auto flex-1">
            {displayList.length === 0 ? (
              <div className="px-4 py-5 text-center font-dm text-[13px] text-[var(--neutral-400,#9ca3af)]">
                No customers found
              </div>
            ) : (
              displayList.map((customer) => {
                const isSelected = value.includes(customer.id);
                const isOnlyOne  = isSelected && value.length <= 1;

                return (
                  <div
                    key={customer.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(customer.id)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5
                      cursor-pointer
                      transition-colors
                      ${isOnlyOne ? "opacity-50 cursor-not-allowed" : ""}
                      ${isSelected
                        ? "bg-green-50 dark:bg-green-900/20"
                        : "hover:bg-[var(--neutral-50,#f9fafb)] dark:hover:bg-[var(--dark-bg,#111827)]"
                      }
                    `}
                  >
                    {/* Animated checkbox */}
                    <CheckboxGreen
                      checked={isSelected}
                      disabled={isOnlyOne}
                    />

                    {/* Avatar */}
                    <Avatar customer={customer} />

                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      <div className="font-dm text-[13px] font-medium text-[var(--neutral-900,#111827)] dark:text-[var(--dark-text,#f9fafb)] truncate">
                        {customer.name}
                      </div>
                      <div className="font-dm text-[11px] text-[var(--neutral-400,#9ca3af)] truncate">
                        {customer.email}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
