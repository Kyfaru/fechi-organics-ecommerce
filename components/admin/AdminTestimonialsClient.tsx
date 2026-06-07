"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Testimonial = {
  id: string;
  authorName: string;
  location: string | null;
  quote: string;
  rating: number;
  beforeKey: string;
  afterKey: string;
  source: "facebook" | "manual";
  approved: boolean;
  sortOrder: number;
  createdAt: string;
};

type ApiResponse = {
  ok: boolean;
  data: { testimonials: Testimonial[] };
};

// ---------------------------------------------------------------------------
// Skeleton card — shown during initial load (6 cards)
// ---------------------------------------------------------------------------
function SkeletonCard() {
  return (
    <div
      className="rounded-[16px] h-[220px] animate-pulse"
      style={{ backgroundColor: "#e8fce3" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Star rating display — filled stars up to rating, outline for remainder
// ---------------------------------------------------------------------------
function StarRating({ rating }: { rating: number }) {
  const MAX = 5;
  return (
    <div className="flex items-center gap-[2px]">
      {Array.from({ length: MAX }).map((_, i) => (
        <Icon
          key={i}
          icon={i < rating ? "mdi:star" : "mdi:star-outline"}
          width={14}
          style={{ color: i < rating ? "#fec700" : "#c0cab8" }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source badge — Facebook blue or Manual grey
// ---------------------------------------------------------------------------
function SourceBadge({ source }: { source: "facebook" | "manual" }) {
  const isFb = source === "facebook";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-body font-semibold capitalize"
      style={{
        fontSize: 11,
        backgroundColor: isFb ? "#e7f3fe" : "#f3f3f3",
        color: isFb ? "#1877f2" : "#40493c",
      }}
    >
      {isFb && <Icon icon="mdi:facebook" width={11} />}
      {source}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Individual testimonial card
// ---------------------------------------------------------------------------
function TestimonialCard({
  testimonial,
  isApprovePending,
  isSortPending,
  onApproveToggle,
  onSortChange,
}: {
  testimonial: Testimonial;
  isApprovePending: boolean;
  isSortPending: boolean;
  onApproveToggle: (t: Testimonial) => void;
  onSortChange: (id: string, newOrder: number) => void;
}) {
  // Local sort order state — fires PATCH on blur only if the value changed
  const [localOrder, setLocalOrder] = useState(testimonial.sortOrder);
  const [inputFocused, setInputFocused] = useState(false);

  function handleSortBlur() {
    setInputFocused(false);
    if (localOrder !== testimonial.sortOrder) {
      onSortChange(testimonial.id, localOrder);
    }
  }

  const isApproved = testimonial.approved;

  return (
    <div
      className="bg-white rounded-[16px] p-5 flex flex-col gap-3"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
    >
      {/* ── Top row: author + source badge ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-heading font-semibold text-[#1a1c1c] text-[14px] leading-snug truncate">
            {testimonial.authorName}
          </p>
          {testimonial.location && (
            <p className="font-body text-[#a1a1a1] text-[12px] truncate mt-[1px]">
              {testimonial.location}
            </p>
          )}
        </div>
        <SourceBadge source={testimonial.source} />
      </div>

      {/* ── Star rating ── */}
      <StarRating rating={testimonial.rating} />

      {/* ── Quote ── */}
      <p
        className="font-body text-[#40493c] leading-[1.6] italic line-clamp-3"
        style={{ fontSize: 14 }}
      >
        &ldquo;{testimonial.quote}&rdquo;
      </p>

      {/* ── Before / After keys ── */}
      <div className="flex flex-col gap-[3px]">
        <span
          className="font-mono truncate text-[#a1a1a1]"
          style={{ fontSize: 11 }}
          title={`Before: ${testimonial.beforeKey}`}
        >
          Before: {testimonial.beforeKey}
        </span>
        <span
          className="font-mono truncate text-[#a1a1a1]"
          style={{ fontSize: 11 }}
          title={`After: ${testimonial.afterKey}`}
        >
          After: {testimonial.afterKey}
        </span>
      </div>

      {/* ── Bottom row: approve button + sort order ── */}
      <div className="flex items-center justify-between gap-3 mt-auto pt-1 border-t border-[#f3f3f3]">
        {/* Approve toggle */}
        <button
          onClick={() => onApproveToggle(testimonial)}
          disabled={isApprovePending}
          aria-label={isApproved ? "Remove approval" : "Approve testimonial"}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            fontSize: 12,
            backgroundColor: isApproved ? "#27731e" : "transparent",
            color: isApproved ? "#ffffff" : "#40493c",
            border: isApproved ? "none" : "1px solid #c0cab8",
          }}
        >
          {isApprovePending ? (
            <Spinner size={12} invert={isApproved} />
          ) : (
            <Icon
              icon={isApproved ? "mdi:check-circle" : "mdi:circle-outline"}
              width={14}
            />
          )}
          {isApproved ? "Approved" : "Approve"}
        </button>

        {/* Sort order input */}
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={`sort-${testimonial.id}`}
            className="font-body text-[#a1a1a1] whitespace-nowrap"
            style={{ fontSize: 11 }}
          >
            Order
          </label>
          <div className="relative flex items-center">
            <input
              id={`sort-${testimonial.id}`}
              type="number"
              min={0}
              value={localOrder}
              onChange={(e) => setLocalOrder(Number(e.target.value))}
              onFocus={() => setInputFocused(true)}
              onBlur={handleSortBlur}
              disabled={isSortPending}
              className="w-[52px] text-center rounded-[6px] font-body font-semibold transition-colors disabled:opacity-60"
              style={{
                fontSize: 12,
                color: "#1a1c1c",
                padding: "4px 6px",
                border: inputFocused ? "1px solid #27731e" : "1px solid #c0cab8",
                outline: "none",
                backgroundColor: "#f9f9f9",
              }}
            />
            {isSortPending && (
              <span className="absolute -right-5">
                <Spinner size={11} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------
export function AdminTestimonialsClient() {
  const qc = useQueryClient();

  // Per-row pending state for approve toggle — tracks a single in-flight ID
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);

  // Per-row pending state for sort order update — separate from approve
  const [pendingSortId, setPendingSortId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data fetch
  // -------------------------------------------------------------------------
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["admin-testimonials"],
    queryFn: () => fetch("/api/admin/testimonials").then((r) => r.json()),
    staleTime: 30_000,
  });

  const testimonials = data?.data?.testimonials ?? [];
  const approvedCount = testimonials.filter((t) => t.approved).length;

  // -------------------------------------------------------------------------
  // Approve toggle mutation
  // -------------------------------------------------------------------------
  const toggleApprove = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const res = await fetch("/api/admin/testimonials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approved }),
      });
      return res.json();
    },
    onMutate: ({ id }) => {
      setPendingApproveId(id);
    },
    onSuccess: (result, variables) => {
      if (result.ok) {
        toast.success(
          variables.approved ? "Testimonial approved" : "Approval removed"
        );
        qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      } else {
        toast.error("Failed to update");
      }
    },
    onError: () => {
      toast.error("Failed to update");
    },
    onSettled: () => {
      setPendingApproveId(null);
    },
  });

  // -------------------------------------------------------------------------
  // Sort order mutation
  // -------------------------------------------------------------------------
  const updateSort = useMutation({
    mutationFn: async ({
      id,
      sortOrder,
    }: {
      id: string;
      sortOrder: number;
    }) => {
      const res = await fetch("/api/admin/testimonials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, sortOrder }),
      });
      return res.json();
    },
    onMutate: ({ id }) => {
      setPendingSortId(id);
    },
    onSuccess: (result) => {
      if (result.ok) {
        qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      } else {
        toast.error("Failed to update sort order");
      }
    },
    onError: () => {
      toast.error("Failed to update sort order");
    },
    onSettled: () => {
      setPendingSortId(null);
    },
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  function handleApproveToggle(t: Testimonial) {
    toggleApprove.mutate({ id: t.id, approved: !t.approved });
  }

  function handleSortChange(id: string, newOrder: number) {
    updateSort.mutate({ id, sortOrder: newOrder });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen">
      {/* ── Page header ── */}
      <div className="px-6 py-5 bg-white border-b border-[#e2e2e2] flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <h1 className="font-heading font-semibold text-[#1a1c1c] text-[24px] leading-tight">
            Testimonials
          </h1>
          {/* Total count badge */}
          {!isLoading && (
            <span className="bg-[#e8fce3] text-[#27731e] font-body font-semibold text-[12px] px-2.5 py-0.5 rounded-full">
              {testimonials.length}
            </span>
          )}
        </div>

        {/* Approved sub-stat */}
        {!isLoading && testimonials.length > 0 && (
          <span className="font-body text-[#40493c] text-[13px]">
            Approved:{" "}
            <span className="font-semibold text-[#27731e]">{approvedCount}</span>
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className="p-6 max-w-[1400px] mx-auto">

        {/* Error state */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon
              icon="mdi:alert-circle-outline"
              width={52}
              className="text-[#e53935] mb-3"
            />
            <p className="font-body text-[#40493c] text-[15px]">
              Could not load testimonials. Please refresh the page.
            </p>
          </div>
        )}

        {/* Card grid */}
        {!isError && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Loading skeletons — 6 placeholder cards */}
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}

            {/* Empty state */}
            {!isLoading && testimonials.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                <Icon
                  icon="mdi:comment-text-outline"
                  width={52}
                  className="text-[#c0cab8] mb-3"
                />
                <p className="font-body text-[#40493c] text-[15px]">
                  No testimonials yet.
                </p>
              </div>
            )}

            {/* Testimonial cards */}
            {!isLoading &&
              testimonials.map((t) => (
                <TestimonialCard
                  key={t.id}
                  testimonial={t}
                  isApprovePending={pendingApproveId === t.id}
                  isSortPending={pendingSortId === t.id}
                  onApproveToggle={handleApproveToggle}
                  onSortChange={handleSortChange}
                />
              ))}
          </div>
        )}

        {/* Footer count */}
        {!isLoading && !isError && testimonials.length > 0 && (
          <p className="font-body text-[#a1a1a1] text-[13px] mt-6 text-right">
            {testimonials.length} testimonial{testimonials.length !== 1 ? "s" : ""} total
          </p>
        )}
      </div>
    </div>
  );
}
