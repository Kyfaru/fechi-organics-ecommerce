"use client";

import { useState } from "react";
import { Star, Check, X, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/admin/ui/StatCard";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Drawer } from "@/components/admin/ui/Drawer";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Types
// NOTE: No review model exists in the schema yet. This page shows a placeholder
// UI that is ready for integration once the model is added to Prisma.
// TODO: Add `review` model to prisma/schema.prisma, then wire up the API.
// ---------------------------------------------------------------------------
type Review = {
  id: string;
  productName: string;
  customer: string;
  rating: number;
  text: string;
  date: string;
  status: "pending" | "approved" | "rejected";
  adminReply?: string;
};

// ---------------------------------------------------------------------------
// Star renderer
// ---------------------------------------------------------------------------
function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-(--gold-700)">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={13} fill={i < rating ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component — placeholder with empty state ready for API integration
// ---------------------------------------------------------------------------
export function AdminProductReviewsClient() {
  const [replyDrawerOpen, setReplyDrawerOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState("");

  // TODO: Replace with real API call once /api/admin/products/reviews route exists.
  const { data, isLoading } = useQuery<{ ok: boolean; data: { reviews: Review[]; stats: { total: number; avg: number; pending: number; thisMonth: number } } }>({
    queryKey: ["admin-reviews"],
    queryFn: async () => {
      // Placeholder — returns empty data until review model is implemented
      console.info("[admin/reviews] Fetching reviews — API not yet implemented");
      return {
        ok: true,
        data: {
          reviews: [],
          stats: { total: 0, avg: 0, pending: 0, thisMonth: 0 },
        },
      };
    },
  });

  const reviews = data?.data?.reviews ?? [];
  const stats = data?.data?.stats ?? { total: 0, avg: 0, pending: 0, thisMonth: 0 };

  function openReply(review: Review) {
    setSelectedReview(review);
    setReplyText(review.adminReply ?? "");
    setReplyDrawerOpen(true);
  }

  function handleSendReply() {
    if (!replyText.trim()) { toast.error("Reply cannot be empty"); return; }
    // TODO: POST /api/admin/products/reviews/{id}/reply
    toast.info("Reply saved (API integration pending)");
    setReplyDrawerOpen(false);
  }

  const columns = [
    {
      key: "productName",
      label: "Product",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return <span className="font-dm text-[14px] font-medium text-(--neutral-900)">{r.productName}</span>;
      },
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return <span className="font-dm text-[14px] text-(--neutral-700)">{r.customer}</span>;
      },
    },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return <StarRating rating={r.rating} />;
      },
    },
    {
      key: "text",
      label: "Review",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return (
          <span className="font-dm text-[13px] text-(--neutral-500) line-clamp-1 max-w-[240px]">
            {r.text.length > 60 ? r.text.slice(0, 60) + "…" : r.text}
          </span>
        );
      },
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return (
          <span className="font-dm text-[13px] text-(--neutral-400)">
            {new Date(r.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return <StatusPill status={r.status} />;
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {r.status === "pending" && (
              <>
                <button
                  title="Approve"
                  // TODO: POST /api/admin/products/reviews/${r.id}/approve
                  onClick={() => toast.info("Approve — API pending")}
                  className="w-7 h-7 rounded-[6px] bg-(--green-50) text-(--success) flex items-center justify-center hover:opacity-80 transition-opacity"
                >
                  <Check size={14} />
                </button>
                <button
                  title="Reject"
                  // TODO: POST /api/admin/products/reviews/${r.id}/reject
                  onClick={() => toast.info("Reject — API pending")}
                  className="w-7 h-7 rounded-[6px] bg-(--danger-bg) text-(--danger) flex items-center justify-center hover:opacity-80 transition-opacity"
                >
                  <X size={14} />
                </button>
              </>
            )}
            <button
              title="Reply"
              onClick={() => openReply(r)}
              className="w-7 h-7 rounded-[6px] bg-(--neutral-100) text-(--neutral-500) flex items-center justify-center hover:bg-(--neutral-200) transition-colors"
            >
              <MessageSquare size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  const replyFooter = (
    <>
      <button
        onClick={() => setReplyDrawerOpen(false)}
        className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) mr-auto transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={handleSendReply}
        className="h-9 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
      >
        Send Reply
      </button>
    </>
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Reviews"
        description="Manage customer product reviews"
        breadcrumbs={[
          { label: "Products", href: "/admin/products" },
          { label: "Reviews", href: "/admin/products/reviews" },
        ]}
      />

      {/* Stats */}
      <div className="px-6 mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard eyebrow="Total Reviews" value={String(stats.total)} icon={Star} />
        <StatCard eyebrow="Avg Rating" value={stats.avg ? stats.avg.toFixed(1) : "—"} icon={Star} />
        <StatCard eyebrow="Pending" value={String(stats.pending)} icon={MessageSquare} />
        <StatCard eyebrow="This Month" value={String(stats.thisMonth)} />
      </div>

      <div className="px-6">
        <DataTable
          columns={columns}
          data={reviews as unknown as Record<string, unknown>[]}
          loading={isLoading}
          onRowClick={(row) => openReply(row as unknown as Review)}
          emptyTitle="No reviews yet"
          emptyDescription="Customer reviews will appear here once the review system is implemented."
          pageSize={20}
        />
      </div>

      {/* Reply Drawer */}
      <Drawer
        open={replyDrawerOpen}
        onClose={() => setReplyDrawerOpen(false)}
        title="Reply to Review"
        width={480}
        footer={replyFooter}
      >
        {selectedReview && (
          <div className="flex flex-col gap-5">
            {/* Review display */}
            <div className="bg-(--neutral-50) rounded-[10px] p-4 border border-(--neutral-200)">
              <div className="flex items-center justify-between mb-2">
                <span className="font-dm text-[13px] font-medium text-(--neutral-900)">{selectedReview.customer}</span>
                <StarRating rating={selectedReview.rating} />
              </div>
              <p className="font-dm text-[13px] text-(--neutral-700)">{selectedReview.text}</p>
              <p className="font-dm text-[11px] text-(--neutral-400) mt-2">
                {new Date(selectedReview.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}{selectedReview.productName}
              </p>
            </div>

            {/* Reply textarea */}
            <div>
              <label className="block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5">
                Admin Reply
              </label>
              <textarea
                rows={5}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Thank you for your feedback…"
                className="w-full font-dm text-[14px] text-(--neutral-900) rounded-[8px] border border-(--neutral-200) bg-white px-3 py-2 focus:outline-none focus:border-(--green-800) resize-none transition-colors placeholder:text-(--neutral-400)"
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
