"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Drawer } from "@/components/admin/ui/Drawer";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Types
// NOTE: No Q&A model exists in the schema yet. This page is a placeholder UI
// ready for integration once the model is added.
// TODO: Add `productQuestion` model to prisma/schema.prisma, then wire API.
// ---------------------------------------------------------------------------
type QnAItem = {
  id: string;
  productName: string;
  customer: string;
  question: string;
  answer?: string;
  date: string;
  status: "pending" | "answered";
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminProductQnAClient() {
  const [answerDrawerOpen, setAnswerDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QnAItem | null>(null);
  const [answerText, setAnswerText] = useState("");

  // TODO: Replace with real API call once /api/admin/products/qna route exists.
  const { data, isLoading } = useQuery<{ ok: boolean; data: { items: QnAItem[] } }>({
    queryKey: ["admin-qna"],
    queryFn: async () => {
      console.info("[admin/qna] Fetching Q&A — API not yet implemented");
      return { ok: true, data: { items: [] } };
    },
  });

  const items = data?.data?.items ?? [];

  function openAnswer(item: QnAItem) {
    setSelectedItem(item);
    setAnswerText(item.answer ?? "");
    setAnswerDrawerOpen(true);
  }

  function handleSubmitAnswer() {
    if (!answerText.trim()) { toast.error("Answer cannot be empty"); return; }
    // TODO: POST /api/admin/products/qna/${selectedItem.id}/answer
    toast.info("Answer saved (API integration pending)");
    setAnswerDrawerOpen(false);
  }

  const columns = [
    {
      key: "productName",
      label: "Product",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const item = row as unknown as QnAItem;
        return <span className="font-dm text-[14px] font-medium text-[--neutral-900]">{item.productName}</span>;
      },
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const item = row as unknown as QnAItem;
        return <span className="font-dm text-[14px] text-[--neutral-700]">{item.customer}</span>;
      },
    },
    {
      key: "question",
      label: "Question",
      render: (_: unknown, row: Record<string, unknown>) => {
        const item = row as unknown as QnAItem;
        return (
          <span className="font-dm text-[13px] text-[--neutral-500] line-clamp-1 max-w-[280px]">
            {item.question.length > 80 ? item.question.slice(0, 80) + "…" : item.question}
          </span>
        );
      },
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (_: unknown, row: Record<string, unknown>) => {
        const item = row as unknown as QnAItem;
        return (
          <span className="font-dm text-[13px] text-[--neutral-400]">
            {new Date(item.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const item = row as unknown as QnAItem;
        return <StatusPill status={item.status} />;
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const item = row as unknown as QnAItem;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); openAnswer(item); }}
            className="h-8 px-3 rounded-[6px] font-dm text-[12px] text-[--green-800] border border-[--green-800] hover:bg-[--green-50] transition-colors"
          >
            {item.status === "answered" ? "Edit Answer" : "Answer"}
          </button>
        );
      },
    },
  ];

  const answerFooter = (
    <>
      <button
        onClick={() => setAnswerDrawerOpen(false)}
        className="h-9 px-4 rounded-[8px] border border-[--neutral-200] font-dm text-[13px] text-[--neutral-700] hover:bg-[--neutral-50] mr-auto transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={handleSubmitAnswer}
        className="h-9 px-5 rounded-[8px] bg-[--green-800] font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
      >
        Submit Answer
      </button>
    </>
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Q&A"
        description="Answer customer product questions"
        breadcrumbs={[
          { label: "Products", href: "/admin/products" },
          { label: "Q&A", href: "/admin/products/qna" },
        ]}
      />

      <div className="px-6">
        <DataTable
          columns={columns}
          data={items as unknown as Record<string, unknown>[]}
          loading={isLoading}
          onRowClick={(row) => openAnswer(row as unknown as QnAItem)}
          emptyTitle="No questions yet"
          emptyDescription="Customer Q&A will appear here once the feature is implemented."
          pageSize={20}
        />
      </div>

      {/* Answer Drawer */}
      <Drawer
        open={answerDrawerOpen}
        onClose={() => setAnswerDrawerOpen(false)}
        title="Answer Question"
        width={480}
        footer={answerFooter}
      >
        {selectedItem && (
          <div className="flex flex-col gap-5">
            {/* Question display */}
            <div className="bg-[--neutral-50] rounded-[10px] p-4 border border-[--neutral-200]">
              <div className="flex items-start gap-2 mb-2">
                <HelpCircle size={15} className="text-[--neutral-400] shrink-0 mt-0.5" />
                <p className="font-dm text-[14px] font-medium text-[--neutral-900]">{selectedItem.question}</p>
              </div>
              <p className="font-dm text-[11px] text-[--neutral-400]">
                From <strong>{selectedItem.customer}</strong> · {selectedItem.productName} ·{" "}
                {new Date(selectedItem.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>

            {/* Existing answer */}
            {selectedItem.answer && (
              <div className="bg-[--green-50] rounded-[10px] p-4 border border-[--green-800]/20">
                <p className="font-dm text-[12px] font-semibold text-[--green-800] mb-1 uppercase tracking-wide">Current Answer</p>
                <p className="font-dm text-[13px] text-[--neutral-700]">{selectedItem.answer}</p>
              </div>
            )}

            {/* Answer textarea */}
            <div>
              <label className="block font-dm text-[12px] font-semibold text-[--neutral-500] uppercase tracking-[0.6px] mb-1.5">
                {selectedItem.answer ? "Update Answer" : "Your Answer"}
              </label>
              <textarea
                rows={5}
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Write a helpful answer for this customer…"
                className="w-full font-dm text-[14px] text-[--neutral-900] rounded-[8px] border border-[--neutral-200] bg-white px-3 py-2 focus:outline-none focus:border-[--green-800] resize-none transition-colors placeholder:text-[--neutral-400]"
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
