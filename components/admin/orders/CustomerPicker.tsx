"use client";

/**
 * CustomerPicker — single-select searchable customer dropdown for the in-store
 * order wizard's "Customer Details" step.
 *
 * Visually/interactionally adapted from components/ui/MultiCustomerSelect.tsx
 * (search bar, avatar rows, outside-click + Escape to close) but:
 *   - Single-select instead of multi-select (no pills, no checkboxes — a
 *     highlighted row + Check icon indicates the current selection).
 *   - A pinned "New customer" option is always shown first in the dropdown,
 *     regardless of the search query, and is the default selection. Picking
 *     it clears any previously-selected existing customer so the caller can
 *     reveal blank, editable fields.
 *
 * This component only owns the picker/search UI — it does not own the
 * Full Name / Phone / Email field state. The caller (NewOrderClient) reacts
 * to onSelectCustomer to autofill those fields and keeps them editable
 * afterward.
 */

import React, { useRef, useState, useEffect } from "react";
import { Search, UserPlus, Check, ChevronDown, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CustomerPickerOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  image?: string;
}

export interface CustomerPickerProps {
  customers: CustomerPickerOption[];
  /** Shows a loading row in the dropdown while the customer list is fetching. */
  loading?: boolean;
  /** null = the pinned "New customer" option is selected. */
  selectedCustomerId: string | null;
  /** Fired with the full customer record, or null when "New customer" is chosen. */
  onSelectCustomer: (customer: CustomerPickerOption | null) => void;
  placeholder?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Small helper — customer initials avatar (same pattern as MultiCustomerSelect)
// ---------------------------------------------------------------------------
function Avatar({ name, image }: { name: string; image?: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-(--green-100) text-(--green-800) flex items-center justify-center text-[11px] font-semibold shrink-0 font-dm">
      {initials || "?"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CustomerPicker({
  customers,
  loading = false,
  selectedCustomerId,
  onSelectCustomer,
  placeholder = "Search existing customers…",
  className = "",
}: CustomerPickerProps) {
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
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // ── Keyboard: Escape closes, auto-focus search on open ───────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;

  const filteredCustomers = customers
    .filter((c) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function selectNew() {
    onSelectCustomer(null);
    setOpen(false);
    setQuery("");
  }

  function selectCustomer(customer: CustomerPickerOption) {
    onSelectCustomer(customer);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger — shows current selection */}
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
        className={`min-h-[50px] w-full px-3 py-2 flex items-center gap-2.5 rounded-[8px] border cursor-pointer
          border-(--neutral-200) dark:border-(--dark-border)
          bg-white dark:bg-(--dark-surface)
          focus:outline-none transition-colors
          ${open ? "border-(--green-800)" : ""}`}
      >
        {selectedCustomer ? (
          <>
            <Avatar name={selectedCustomer.name} image={selectedCustomer.image} />
            <div className="flex-1 min-w-0">
              <div className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">
                {selectedCustomer.name}
              </div>
              <div className="font-dm text-[11px] text-(--neutral-400) truncate">{selectedCustomer.email}</div>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full bg-(--green-800) text-white flex items-center justify-center shrink-0">
              <UserPlus size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-dm text-[13px] font-medium text-(--green-900) dark:text-(--dark-text)">
                New customer
              </div>
              <div className="font-dm text-[11px] text-(--neutral-400)">Walk-in — enter details below</div>
            </div>
          </>
        )}
        <ChevronDown
          size={16}
          className={`text-(--neutral-400) shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-white dark:bg-(--dark-surface)
            border border-(--neutral-200) dark:border-(--dark-border)
            rounded-[10px] shadow-(--e2) max-h-[340px] overflow-hidden flex flex-col"
          role="listbox"
        >
          {/* Search bar */}
          <div className="px-3 pt-3 pb-2 border-b border-(--neutral-100) dark:border-(--dark-border) shrink-0">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full h-9 pl-8 pr-3 rounded-[6px] border border-(--neutral-200) dark:border-(--dark-border)
                  bg-(--neutral-50) dark:bg-(--dark-bg)
                  font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text)
                  outline-none focus:border-(--green-800) placeholder:text-(--neutral-400) transition-colors"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Pinned "New customer" option — always visible, ignores the search query */}
            <div
              role="option"
              aria-selected={selectedCustomerId === null}
              onClick={selectNew}
              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors
                border-b border-(--neutral-100) dark:border-(--dark-border)
                ${
                  selectedCustomerId === null
                    ? "bg-(--green-50) dark:bg-green-900/20"
                    : "hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg)"
                }`}
            >
              <div className="w-8 h-8 rounded-full bg-(--green-800) text-white flex items-center justify-center shrink-0">
                <UserPlus size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-dm text-[13px] font-medium text-(--green-900) dark:text-(--dark-text)">
                  New customer
                </div>
                <div className="font-dm text-[11px] text-(--neutral-400)">Add a walk-in customer</div>
              </div>
              {selectedCustomerId === null && <Check size={15} className="text-(--green-800) shrink-0" />}
            </div>

            {/* Existing customers */}
            {loading ? (
              <div className="px-4 py-5 flex items-center justify-center gap-2 font-dm text-[13px] text-(--neutral-400)">
                <Loader2 size={14} className="animate-spin" />
                Loading customers…
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="px-4 py-5 text-center font-dm text-[13px] text-(--neutral-400)">
                {query.trim() ? "No customers found" : "No existing customers yet"}
              </div>
            ) : (
              filteredCustomers.map((customer) => {
                const isSelected = customer.id === selectedCustomerId;
                return (
                  <div
                    key={customer.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectCustomer(customer)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-(--green-50) dark:bg-green-900/20"
                        : "hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg)"
                    }`}
                  >
                    <Avatar name={customer.name} image={customer.image} />
                    <div className="flex-1 min-w-0">
                      <div className="font-dm text-[13px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">
                        {customer.name}
                      </div>
                      <div className="font-dm text-[11px] text-(--neutral-400) truncate">{customer.email}</div>
                    </div>
                    {isSelected && <Check size={15} className="text-(--green-800) shrink-0" />}
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
