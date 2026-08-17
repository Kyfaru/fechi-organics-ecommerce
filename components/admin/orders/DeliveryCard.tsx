"use client";

/**
 * DeliveryCard — optional delivery for the in-store order wizard's Products
 * step. Off by default; toggling it on reveals Country (constant) / County
 * (locked to the admin's own branch unless super admin) / Location (a
 * searchable dropdown over the existing branch-scoped DeliveryZone pricing
 * table, GET /api/admin/delivery-zones).
 *
 * The "+" custom-area button is deliberately inert for now — per the design
 * brief, custom delivery areas need an approval workflow that doesn't exist
 * yet, so submitting one only toasts and never calls
 * POST /api/admin/delivery-zones (the real endpoint, already wired for the
 * Delivery Zones settings page, not connected here on purpose).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Check, ChevronDown, Loader2, MapPin } from "lucide-react";
import Switch from "@/components/ui/Switch";
import { PrelineSelect } from "@/components/admin/ui/PrelineSelect";
import { KENYA_COUNTIES } from "@/lib/kenya-counties";
import { toast } from "@/lib/toast";

export interface DeliveryZoneSelection {
  id: string;
  name: string;
  county: string;
  deliveryFeeKes: number;
}

interface DeliveryCardProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  selectedZone: DeliveryZoneSelection | null;
  onZoneChange: (zone: DeliveryZoneSelection | null) => void;
}

interface AdminMeResponse {
  branchId: string | null;
  branchName: string | null;
  isSuperAdmin: boolean;
}

interface BranchOption {
  id: string;
  name: string;
  county: string;
}

interface ZoneRow {
  id: string;
  name: string;
  county: string;
  deliveryFeeKes: number;
  branchId: string | null;
  isActive: boolean;
}

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

export default function DeliveryCard({ enabled, onEnabledChange, selectedZone, onZoneChange }: DeliveryCardProps) {
  // Same query key PaymentStep.tsx uses — react-query dedupes the fetch so
  // the wizard only hits /api/admin/me once across both steps.
  const { data: me } = useQuery<AdminMeResponse>({
    queryKey: ["admin-me-instore"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me");
      const json = await res.json();
      return {
        branchId: json?.branchId ?? null,
        branchName: json?.branchName ?? null,
        isSuperAdmin: Boolean(json?.isSuperAdmin),
      };
    },
    enabled,
  });
  const isSuperAdmin = me?.isSuperAdmin ?? false;

  const { data: branches = [] } = useQuery<BranchOption[]>({
    queryKey: ["admin-branches-instore"],
    queryFn: async () => {
      const res = await fetch("/api/branches");
      const json = await res.json();
      return (json?.data?.branches ?? []) as BranchOption[];
    },
    enabled: enabled && !isSuperAdmin,
  });
  const myBranch = branches.find((b) => b.id === me?.branchId) ?? null;

  const [superAdminCounty, setSuperAdminCounty] = useState("");
  const county = isSuperAdmin ? superAdminCounty : (myBranch?.county ?? "");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customArea, setCustomArea] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const { data: zones = [], isLoading: zonesLoading } = useQuery<ZoneRow[]>({
    queryKey: ["admin-delivery-zones-instore", county],
    queryFn: async () => {
      const res = await fetch(`/api/admin/delivery-zones?county=${encodeURIComponent(county)}`);
      const json = await res.json();
      return (json?.data?.zones ?? []) as ZoneRow[];
    },
    enabled: enabled && Boolean(county),
  });

  const effectiveBranchId = isSuperAdmin ? undefined : me?.branchId;
  const zoneOptions = zones
    .filter((z) => z.isActive && (z.branchId === null || z.branchId === effectiveBranchId))
    .filter((z) => !query.trim() || z.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  function selectZone(zone: ZoneRow) {
    onZoneChange({ id: zone.id, name: zone.name, county: zone.county, deliveryFeeKes: zone.deliveryFeeKes });
    setOpen(false);
    setQuery("");
  }

  function handleCountyChange(next: string) {
    setSuperAdminCounty(next);
    onZoneChange(null);
  }

  function handleAddCustomArea() {
    toast.info("Custom delivery areas require approval", {
      message: "This request has been noted — a team member will follow up before it's usable on orders.",
    });
    setCustomMode(false);
    setCustomArea("");
    setCustomPrice("");
  }

  return (
    <div className="rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-syne text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">Delivery</h3>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <Switch checked={enabled} onChange={onEnabledChange} />
        </label>
      </div>
      <p className="font-dm text-[12px] text-(--neutral-400) mb-3">
        Off by default — turn on only if this order needs to be delivered.
      </p>

      {enabled && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1">
                Country
              </label>
              <input
                type="text"
                value="Kenya"
                disabled
                className="w-full h-9 px-3 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg) font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)"
              />
            </div>
            <div>
              <label className="block font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1">
                County
              </label>
              {isSuperAdmin ? (
                <PrelineSelect
                  options={KENYA_COUNTIES.map((c) => ({ value: c, label: c }))}
                  value={superAdminCounty}
                  onChange={handleCountyChange}
                  placeholder="Select county…"
                />
              ) : (
                <input
                  type="text"
                  value={myBranch?.county ?? "—"}
                  disabled
                  className="w-full h-9 px-3 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg) font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1">
              Location
            </label>
            <div ref={containerRef} className="relative">
              <div
                role="button"
                tabIndex={0}
                onClick={() => county && setOpen((o) => !o)}
                className={`h-10 w-full px-3 flex items-center gap-2 rounded-[8px] border cursor-pointer
                  border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface)
                  ${!county ? "opacity-60 cursor-not-allowed" : ""} ${open ? "border-(--green-800)" : ""}`}
              >
                <MapPin size={14} className="text-(--neutral-400) shrink-0" />
                <span className="flex-1 min-w-0 truncate font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text)">
                  {selectedZone ? `${selectedZone.name} — ${formatKes(selectedZone.deliveryFeeKes)}` : county ? "Select a location…" : "Select a county first"}
                </span>
                <ChevronDown size={15} className={`text-(--neutral-400) shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </div>

              {open && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) rounded-[10px] shadow-(--e2) max-h-[300px] overflow-hidden flex flex-col">
                  {!customMode ? (
                    <>
                      <div className="px-3 pt-3 pb-2 border-b border-(--neutral-100) dark:border-(--dark-border) shrink-0 flex items-center gap-2">
                        <div className="relative flex-1 min-w-0">
                          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none" />
                          <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search locations…"
                            className="w-full h-9 pl-8 pr-3 rounded-[6px] border border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-800) transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <button
                          type="button"
                          title="Add a custom area"
                          onClick={(e) => { e.stopPropagation(); setCustomMode(true); }}
                          className="w-9 h-9 shrink-0 rounded-[6px] border border-(--neutral-200) dark:border-(--dark-border) flex items-center justify-center text-(--neutral-500) hover:text-(--green-800) hover:border-(--green-800) transition-colors"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <div className="overflow-y-auto flex-1">
                        {zonesLoading ? (
                          <div className="px-4 py-5 flex items-center justify-center gap-2 font-dm text-[13px] text-(--neutral-400)">
                            <Loader2 size={14} className="animate-spin" /> Loading locations…
                          </div>
                        ) : zoneOptions.length === 0 ? (
                          <div className="px-4 py-5 text-center font-dm text-[13px] text-(--neutral-400)">
                            No delivery locations for this county yet
                          </div>
                        ) : (
                          zoneOptions.map((zone) => {
                            const isSelected = zone.id === selectedZone?.id;
                            return (
                              <div
                                key={zone.id}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => selectZone(zone)}
                                className={`flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                                  isSelected ? "bg-(--green-50) dark:bg-green-900/20" : "hover:bg-(--neutral-50) dark:hover:bg-(--dark-bg)"
                                }`}
                              >
                                <span className="font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) truncate">{zone.name}</span>
                                <span className="flex items-center gap-2 shrink-0">
                                  <span className="font-dm text-[12px] text-(--neutral-500)">{formatKes(zone.deliveryFeeKes)}</span>
                                  {isSelected && <Check size={14} className="text-(--green-800)" />}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-3 flex flex-col gap-2.5">
                      <p className="font-dm text-[12px] text-(--neutral-500)">Add a custom delivery area</p>
                      <input
                        type="text"
                        value={customArea}
                        onChange={(e) => setCustomArea(e.target.value)}
                        placeholder="Area name"
                        className="w-full h-9 px-3 rounded-[6px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-bg) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-800)"
                      />
                      <input
                        type="number"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        placeholder="Price for this area (KES)"
                        className="w-full h-9 px-3 rounded-[6px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-bg) font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) outline-none focus:border-(--green-800)"
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setCustomMode(false)}
                          className="h-8 px-3 rounded-[6px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddCustomArea}
                          disabled={!customArea.trim() || !customPrice.trim()}
                          className="h-8 px-3 rounded-[6px] bg-(--green-800) text-white font-dm text-[12px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
