"use client";

import { useState } from "react";
import { Star, Check, X, MessageSquare,Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatsCard } from "@/components/ui/stats-card";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Drawer } from "@/components/admin/ui/Drawer";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Types — matches GET /api/admin/reviews (testimonial schema)
// ---------------------------------------------------------------------------
type Review = {
  id: string;
  authorName: string;
  quote: string;
  rating: number;
  title: string | null;
  approved: boolean;
  createdAt: string;
  orderId: string | null;
  userId: string | null;
  beforeKey: string | null;
  afterKey: string | null;
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

  const { data, isLoading } = useQuery<Review[]>({
    queryKey: ["admin-reviews"],
    queryFn: async () => {
      const r = await fetch("/api/admin/reviews");
      const d = await r.json();
      return d.data?.reviews ?? [];
    },
  });

  const reviews = data ?? [];

  // Derive stats from the fetched reviews array
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const stats = {
    total: reviews.length,
    avg: reviews.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0,
    pending: reviews.filter((r) => !r.approved).length,
    thisMonth: reviews.filter((r) => new Date(r.createdAt) >= thisMonthStart).length,
  };

  function openReply(review: Review) {
    setSelectedReview(review);
    setReplyText("");
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
      key: "title",
      label: "Title",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return (
          <span className="font-dm text-[14px] font-medium text-(--neutral-900)">
            {r.title ?? <span className="text-(--neutral-400) italic">No title</span>}
          </span>
        );
      },
    },
    {
      key: "authorName",
      label: "Customer",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return <span className="font-dm text-[14px] text-(--neutral-700)">{r.authorName}</span>;
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
      key: "quote",
      label: "Review",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return (
          <span className="font-dm text-[13px] text-(--neutral-500) line-clamp-1 max-w-[240px]">
            {r.quote.length > 60 ? r.quote.slice(0, 60) + "…" : r.quote}
          </span>
        );
      },
    },
    {
      key: "createdAt",
      label: "Date",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return (
          <span className="font-dm text-[13px] text-(--neutral-400)">
            {new Date(r.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        );
      },
    },
    {
      key: "approved",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return <StatusPill status={r.approved ? "approved" : "pending"} />;
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const r = row as unknown as Review;
        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {!r.approved && (
              <>
                <button
                  title="Approve"
                  // TODO: POST /api/admin/reviews/${r.id}/approve
                  onClick={() => toast.info("Approve — coming soon")}
                  className="w-7 h-7 rounded-[6px] bg-(--green-50) text-(--success) flex items-center justify-center hover:opacity-80 transition-opacity"
                >
                  <Check size={14} />
                </button>
                <button
                  title="Reject"
                  // TODO: POST /api/admin/reviews/${r.id}/reject
                  onClick={() => toast.info("Reject — coming soon")}
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
        <StatsCard
  title="Total Reviews"
  value={String(stats.total)}
  icon={<Star className="h-4 w-4 text-muted-foreground" />}
  change="—"
  changeType="positive"
/>

<StatsCard
  title="Avg Rating"
  value={stats.avg ? stats.avg.toFixed(1) : "—"}
  icon={<Star className="h-4 w-4 text-muted-foreground" />}
  change="—"
  changeType="positive"
/>

<StatsCard
  title="Pending"
  value={String(stats.pending)}
  icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
  change="Pending"
  changeType="negative"
/>

<StatsCard
  title="This Month"
  value={String(stats.thisMonth)}
  icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
  change="This Month"
  changeType="positive"
/>
      </div>

      <div className="px-6">
        <DataTable
          columns={columns}
          data={reviews as unknown as Record<string, unknown>[]}
          loading={isLoading}
          onRowClick={(row) => openReply(row as unknown as Review)}
          emptyTitle="No reviews yet"
          emptyDescription="Customer reviews will appear here once orders have been reviewed."
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
                <span className="font-dm text-[13px] font-medium text-(--neutral-900)">{selectedReview.authorName}</span>
                <StarRating rating={selectedReview.rating} />
              </div>
              {selectedReview.title && (
                <p className="font-dm text-[13px] font-semibold text-(--neutral-800) mb-1">{selectedReview.title}</p>
              )}
              <p className="font-dm text-[13px] text-(--neutral-700)">{selectedReview.quote}</p>
              <p className="font-dm text-[11px] text-(--neutral-400) mt-2">
                {new Date(selectedReview.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                {selectedReview.orderId ? ` · Order #${selectedReview.orderId.slice(-8).toUpperCase()}` : ""}
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
