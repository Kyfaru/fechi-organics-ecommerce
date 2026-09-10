"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { X, FileText, FileSpreadsheet, FileCode } from "lucide-react";
import { toast } from "@/lib/toast";
import { DateTimeRangePicker, type DateRangeValue } from "@/components/ui/DateTimeRangePicker";
import { PriceRangeSlider } from "@/components/ui/PriceRangeSlider";
import { PrelineSelect } from "@/components/admin/ui/PrelineSelect";
import ProductMultiSelect from "@/components/ui/ProductMultiSelect";
import MultiCustomerSelect, { type CustomerOption } from "@/components/ui/MultiCustomerSelect";
import { PRICE_MIN, PRICE_MAX } from "@/lib/price-range-steps";
import { ExportProgressModal } from "@/components/admin/exports/ExportProgressModal";

type Format = "pdf" | "csv" | "xml";
type DeliveryChannel = "" | "PICKUP" | "DELIVERY" | "INSTORE";

const ORDER_STATUSES = [
  "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED",
  "CANCELLED", "WAITING_TO_PACKAGE", "READY_FOR_PICKUP", "PICKED_UP", "FAILED",
];

function defaultRange(): DateRangeValue {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
}

function initialFilters() {
  return {
    dateRange: defaultRange(),
    productIds: [] as string[],
    orderStatuses: [] as string[],
    paymentStatus: "" as "" | "PAID" | "PENDING" | "FAILED",
    deliveryChannel: "" as DeliveryChannel,
    customerMode: "all" as "all" | "custom",
    customerIds: [] as string[],
    priceMin: PRICE_MIN,
    priceMax: PRICE_MAX,
    format: "pdf" as Format,
  };
}

interface ExportModalProps {
  resource: "orders" | "finance";
  open: boolean;
  onClose: () => void;
}

const FORMAT_OPTIONS: { id: Format; label: string; icon: typeof FileText }[] = [
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "csv", label: "CSV", icon: FileSpreadsheet },
  { id: "xml", label: "XML", icon: FileCode },
];

const CHANNEL_OPTIONS: { id: DeliveryChannel; label: string }[] = [
  { id: "", label: "All channels" },
  { id: "PICKUP", label: "Store Pickup" },
  { id: "DELIVERY", label: "Home Delivery" },
  { id: "INSTORE", label: "In-Store Walk-in" },
];

export function ExportModal({ resource, open, onClose }: ExportModalProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);
  const [readyId, setReadyId] = useState<string | null>(null);

  const { data: customersData = [] } = useQuery<CustomerOption[]>({
    queryKey: ["admin-customers-simple"],
    queryFn: () =>
      fetch("/api/admin/customers").then((r) =>
        r.json().then((j) => (j?.data?.users ?? []).map((u: CustomerOption) => ({ id: u.id, name: u.name, email: u.email, image: u.image }))),
      ),
    enabled: open && filters.customerMode === "custom",
  });

  function reset() {
    setFilters(initialFilters());
    setSubmitting(false);
    setQueued(false);
    setReadyId(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleDownload() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/${resource}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: filters.dateRange.from?.toISOString() ?? defaultRange().from!.toISOString(),
          to: filters.dateRange.to?.toISOString() ?? defaultRange().to!.toISOString(),
          ...(resource === "orders" && filters.productIds.length ? { productIds: filters.productIds } : {}),
          ...(resource === "orders" && filters.orderStatuses.length ? { orderStatuses: filters.orderStatuses } : {}),
          ...(resource === "orders" && filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
          ...(filters.deliveryChannel ? { deliveryChannel: filters.deliveryChannel } : {}),
          customerMode: filters.customerMode,
          ...(filters.customerMode === "custom" && filters.customerIds.length ? { customerIds: filters.customerIds } : {}),
          ...(filters.priceMin !== PRICE_MIN ? { priceMin: filters.priceMin } : {}),
          ...(filters.priceMax !== PRICE_MAX ? { priceMax: filters.priceMax } : {}),
          format: filters.format,
        }),
      });
      const json = await res.json();
      if (res.status === 202) {
        setQueued(true);
        return;
      }
      if (!json.ok) throw new Error(json.error?.message ?? "Export failed");
      setReadyId(json.data.exportRequestId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {open && !readyId && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/45 z-[60]" onClick={handleClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[560px] max-h-[85vh] overflow-y-auto bg-white dark:bg-(--dark-surface) rounded-[16px] shadow-(--e3) z-[60]"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-(--neutral-100) dark:border-(--dark-border) sticky top-0 bg-white dark:bg-(--dark-surface) z-10">
                <h2 className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                  Export {resource === "orders" ? "Orders" : "Finance"} Report
                </h2>
                <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-full text-(--neutral-400) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border)">
                  <X size={16} />
                </button>
              </div>

              {queued ? (
                <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-(--gold-50) dark:bg-(--dark-bg) flex items-center justify-center">
                    <FileText size={24} className="text-(--gold-700)" />
                  </div>
                  <h3 className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                    Request sent for approval
                  </h3>
                  <p className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted) max-w-[360px]">
                    An admin needs to approve this export before it's generated. You'll see a download icon
                    appear in the header, and the file will save automatically once it's ready.
                  </p>
                  <button onClick={handleClose} className="mt-2 h-10 px-5 rounded-[10px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900)">
                    Close
                  </button>
                </div>
              ) : (
                <div className="p-6 space-y-5">
                  <div>
                    <label className="block font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text) mb-1.5">Date range</label>
                    <DateTimeRangePicker value={filters.dateRange} onChange={(v) => setFilters((f) => ({ ...f, dateRange: v }))} withTime />
                  </div>

                  {resource === "orders" && (
                    <div>
                      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text) mb-1.5">Products</label>
                      <ProductMultiSelect value={filters.productIds} onChange={(ids) => setFilters((f) => ({ ...f, productIds: ids }))} placeholder="All products" />
                    </div>
                  )}

                  {resource === "orders" && (
                    <div>
                      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text) mb-1.5">Order status</label>
                      <div className="flex flex-wrap gap-1.5">
                        {ORDER_STATUSES.map((s) => {
                          const active = filters.orderStatuses.includes(s);
                          return (
                            <button
                              key={s} type="button"
                              onClick={() =>
                                setFilters((f) => ({
                                  ...f,
                                  orderStatuses: active ? f.orderStatuses.filter((x) => x !== s) : [...f.orderStatuses, s],
                                }))
                              }
                              className={[
                                "h-8 px-2.5 rounded-[6px] font-dm text-[12px] font-medium border transition-colors",
                                active ? "bg-(--green-800) border-(--green-800) text-white" : "bg-white border-(--neutral-200) text-(--neutral-600) hover:bg-(--neutral-50)",
                              ].join(" ")}
                            >
                              {s.replace(/_/g, " ")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {resource === "orders" && (
                    <div>
                      <label className="block font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text) mb-1.5">Payment status</label>
                      <PrelineSelect
                        value={filters.paymentStatus}
                        onChange={(v) => setFilters((f) => ({ ...f, paymentStatus: v as typeof f.paymentStatus }))}
                        placeholder="All payment statuses"
                        options={[{ value: "PAID", label: "Paid" }, { value: "PENDING", label: "Pending" }, { value: "FAILED", label: "Failed" }]}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text) mb-1.5">Delivery channel</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CHANNEL_OPTIONS.map((c) => (
                        <button
                          key={c.id || "all"} type="button"
                          onClick={() => setFilters((f) => ({ ...f, deliveryChannel: c.id }))}
                          className={[
                            "h-8 px-3 rounded-[6px] font-dm text-[12px] font-medium border transition-colors",
                            filters.deliveryChannel === c.id ? "bg-(--green-800) border-(--green-800) text-white" : "bg-white border-(--neutral-200) text-(--neutral-600) hover:bg-(--neutral-50)",
                          ].join(" ")}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text) mb-1.5">Customers</label>
                    <div className="flex gap-1.5 mb-2">
                      {(["all", "custom"] as const).map((mode) => (
                        <button
                          key={mode} type="button"
                          onClick={() => setFilters((f) => ({ ...f, customerMode: mode }))}
                          className={[
                            "h-8 px-3 rounded-[6px] font-dm text-[12px] font-medium border transition-colors",
                            filters.customerMode === mode ? "bg-(--green-800) border-(--green-800) text-white" : "bg-white border-(--neutral-200) text-(--neutral-600) hover:bg-(--neutral-50)",
                          ].join(" ")}
                        >
                          {mode === "all" ? "All customers" : "Custom customers"}
                        </button>
                      ))}
                    </div>
                    {filters.customerMode === "custom" && (
                      <MultiCustomerSelect
                        customers={customersData}
                        value={filters.customerIds}
                        onChange={(ids) => setFilters((f) => ({ ...f, customerIds: ids }))}
                        placeholder="Search and select customers…"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text) mb-1.5">Price range</label>
                    <PriceRangeSlider
                      value={{ min: filters.priceMin, max: filters.priceMax }}
                      onChange={(v) => setFilters((f) => ({ ...f, priceMin: v.min, priceMax: v.max }))}
                    />
                  </div>

                  <div>
                    <label className="block font-dm text-[13px] font-medium text-(--neutral-700) dark:text-(--dark-text) mb-1.5">File format</label>
                    <div className="flex gap-1.5">
                      {FORMAT_OPTIONS.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id} type="button"
                          onClick={() => setFilters((f) => ({ ...f, format: id }))}
                          className={[
                            "flex-1 h-10 flex items-center justify-center gap-1.5 rounded-[8px] font-dm text-[13px] font-medium border transition-colors",
                            filters.format === id ? "bg-(--green-800) border-(--green-800) text-white" : "bg-white border-(--neutral-200) text-(--neutral-600) hover:bg-(--neutral-50)",
                          ].join(" ")}
                        >
                          <Icon size={14} /> {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-(--neutral-100) dark:border-(--dark-border)">
                    <button onClick={handleClose} className="h-10 px-4 rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) font-dm text-[14px] text-(--neutral-700) dark:text-(--dark-text) hover:bg-(--neutral-50) dark:hover:bg-(--dark-border)">
                      Cancel
                    </button>
                    <button
                      onClick={handleDownload}
                      disabled={submitting}
                      className="h-10 px-5 rounded-[10px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) disabled:opacity-50"
                    >
                      {submitting ? "Preparing…" : "Download"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ExportProgressModal
        open={!!readyId}
        exportRequestId={readyId}
        onClose={() => {
          // Minimizing hands off to the always-mounted AdminHeader icon —
          // fully close the customize modal too, matching the spec ("closes
          // the customize export modal but minimizes the download modal").
          setReadyId(null);
          handleClose();
        }}
      />
    </>
  );
}
