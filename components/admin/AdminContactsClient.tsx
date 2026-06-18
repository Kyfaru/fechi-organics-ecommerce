"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, XCircle, Loader2, MailOpen, ChevronDown, MailCheck, Archive, Mail } from "lucide-react";
import { toast } from "sonner";

type ContactStatus = "new" | "read" | "archived";

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  createdAt: string;
};

type ApiResponse = {
  ok: boolean;
  data: { items: ContactMessage[]; nextCursor: string | null };
};

const STATUS_TABS: { label: string; value: ContactStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Read", value: "read" },
  { label: "Archived", value: "archived" },
];

// Left border accent color per status
const STATUS_BORDER: Record<ContactStatus, string> = {
  new: "#FFC800",
  read: "#27731E",
  archived: "#c4c4c4",
};

// Badge styles per status — per spec
const STATUS_BADGE: Record<ContactStatus, string> = {
  new: "bg-[#FFC800] text-[#1a1c1c]",
  read: "bg-[#27731E] text-white",
  archived: "bg-[#c4c4c4] text-[#1a1c1c]",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminContactsClient() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ContactStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-contacts", activeTab],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("status", activeTab);
      return fetch(`/api/admin/contact-messages?${params}`).then((r) => r.json());
    },
    refetchInterval: 30_000, // Poll every 30s for new messages
    staleTime: 0,
  });

  // Unread count badge in header
  const { data: countData } = useQuery<{ ok: boolean; data: { count: number } }>({
    queryKey: ["admin-contacts-count"],
    queryFn: () => fetch("/api/admin/contact-messages/count").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const unreadCount = countData?.data?.count ?? 0;
  const allMessages = data?.data?.items ?? [];

  // Client-side search filter (name / email / subject)
  const messages = search.trim()
    ? allMessages.filter((m) => {
        const q = search.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.subject.toLowerCase().includes(q)
        );
      })
    : allMessages;

  // ---------------------------------------------------------------------------
  // Status mutation — PATCH /api/admin/contact-messages/{id}
  // ---------------------------------------------------------------------------
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContactStatus }) => {
      const res = await fetch(`/api/admin/contact-messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast.success(`Message marked as ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["admin-contacts"] });
      qc.invalidateQueries({ queryKey: ["admin-contacts-count"] });
      // If the expanded row was just archived/read, keep it open so the user
      // can still see the action was applied
    },
    onError: () => toast.error("Could not update status"),
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen dark:bg-[#1a1f18]">
      {/* Page header */}
      <div className="px-6 py-6 border-b border-[#e2e2e2] dark:border-[#2d3a2b] bg-white dark:bg-[#1a1f18] flex items-center justify-between">
        <div>
          <h1 className="font-heading font-semibold text-[#1a1c1c] dark:text-[#edf2ec] text-[24px]">
            Inbox{unreadCount > 0 ? ` (${unreadCount} new)` : ""}
          </h1>
          <p className="font-body text-[#40493c] dark:text-[#a8bca4] text-[13px] mt-0.5">
            Contact messages · refreshes every 30s
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="bg-[#FFC800] text-[#1a1c1c] text-[12px] font-bold px-3 py-1 rounded-full">
            {unreadCount} New
          </span>
        )}
      </div>

      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-8">

        {/* Controls row — tabs + search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">

          {/* Pill tab switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={[
                  "rounded-full px-5 py-2 font-body text-[14px] transition-all",
                  activeTab === tab.value
                    ? "bg-[#27731E] text-white"
                    : "bg-white dark:bg-[#232a21] border border-[#c0cab8] dark:border-[#2d3a2b] text-[#40493c] dark:text-[#a8bca4] hover:border-[#27731E] hover:text-[#27731E]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div className="relative sm:ml-auto w-full sm:max-w-[300px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#a1a1a1]" />
            <input
              type="text"
              placeholder="Search by name, email, subject…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-full border font-body text-[13px] text-[#1a1c1c] dark:text-[#edf2ec] bg-white dark:bg-[#232a21] border-[#c0cab8] dark:border-[#2d3a2b] focus:outline-none focus:border-[#27731E] transition-colors placeholder:text-[#a1a1a1]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                aria-label="Clear search"
              >
                <XCircle size={14} className="text-[#a1a1a1]" />
              </button>
            )}
          </div>
        </div>

        {/* Message list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={36} className="text-[#27731E] animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MailOpen size={60} className="text-[#c0cab8] mb-4" />
            <p className="font-body text-[#40493c] dark:text-[#a8bca4] text-[16px]">
              {search ? "No messages match your search." : "No messages in this category."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg, idx) => (
              <motion.div
                key={msg.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.22 }}
                className="bg-white dark:bg-[#232a21] rounded-[12px] shadow-[0_2px_8px_rgba(0,0,0,0.05)] overflow-hidden border-l-4"
                style={{ borderLeftColor: STATUS_BORDER[msg.status] }}
              >
                {/* Row header — click to expand */}
                <button
                  onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[#f9f9f9] dark:hover:bg-[#1e2620] transition-colors"
                >
                  {/* Sender name (bold) */}
                  <span className="font-body font-semibold text-[#1a1c1c] dark:text-[#edf2ec] text-[14px] w-[140px] truncate flex-shrink-0">
                    {msg.name}
                  </span>

                  {/* Subject (14px, truncated) */}
                  <span className="font-body text-[#40493c] dark:text-[#a8bca4] text-[14px] flex-1 truncate">
                    {msg.subject}
                  </span>

                  {/* Status badge */}
                  <span
                    className={[
                      "flex-shrink-0 rounded-full px-3 py-1 font-body text-[11px] font-semibold capitalize",
                      STATUS_BADGE[msg.status],
                    ].join(" ")}
                  >
                    {msg.status}
                  </span>

                  {/* Date (right-aligned, gray) */}
                  <span className="font-body text-[#a1a1a1] text-[12px] w-[130px] flex-shrink-0 text-right hidden sm:block">
                    {formatDate(msg.createdAt)}
                  </span>

                  {/* Chevron */}
                  <ChevronDown
                    size={18}
                    className={[
                      "flex-shrink-0 text-[#a1a1a1] transition-transform duration-200",
                      expandedId === msg.id ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>

                {/* Expanded detail (accordion) */}
                <AnimatePresence initial={false}>
                  {expandedId === msg.id && (
                    <motion.div
                      key="expanded"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      className="overflow-hidden border-t border-[#e2e2e2] dark:border-[#2d3a2b]"
                    >
                      <div className="px-6 py-5 bg-[#fafafa] dark:bg-[#1a1f18]">

                        {/* Contact details grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                          <div>
                            <p className="font-body text-[#a1a1a1] text-[11px] uppercase tracking-[0.8px] mb-1">Name</p>
                            <p className="font-body text-[#1a1c1c] dark:text-[#edf2ec] text-[15px]">{msg.name}</p>
                          </div>
                          <div>
                            <p className="font-body text-[#a1a1a1] text-[11px] uppercase tracking-[0.8px] mb-1">Email</p>
                            <a
                              href={`mailto:${msg.email}`}
                              className="font-body text-[#27731E] text-[15px] hover:underline"
                            >
                              {msg.email}
                            </a>
                          </div>
                          {msg.phone && (
                            <div>
                              <p className="font-body text-[#a1a1a1] text-[11px] uppercase tracking-[0.8px] mb-1">Phone</p>
                              <p className="font-body text-[#1a1c1c] dark:text-[#edf2ec] text-[15px]">{msg.phone}</p>
                            </div>
                          )}
                          <div>
                            <p className="font-body text-[#a1a1a1] text-[11px] uppercase tracking-[0.8px] mb-1">Subject</p>
                            <p className="font-body text-[#1a1c1c] dark:text-[#edf2ec] text-[15px]">{msg.subject}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="font-body text-[#a1a1a1] text-[11px] uppercase tracking-[0.8px] mb-1">Received</p>
                            <p className="font-body text-[#40493c] dark:text-[#a8bca4] text-[14px]">{formatDate(msg.createdAt)}</p>
                          </div>
                        </div>

                        {/* Full message body */}
                        <div className="mb-5">
                          <p className="font-body text-[#a1a1a1] text-[11px] uppercase tracking-[0.8px] mb-2">Message</p>
                          <p className="font-body text-[#40493c] dark:text-[#a8bca4] text-[15px] leading-[1.6] bg-white dark:bg-[#232a21] p-4 rounded-[8px] border border-[#e2e2e2] dark:border-[#2d3a2b] whitespace-pre-wrap">
                            {msg.message}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-3 flex-wrap">

                          {/* Mark as Read — only show if not already read */}
                          {msg.status !== "read" && (
                            <button
                              onClick={() => updateStatus.mutate({ id: msg.id, status: "read" })}
                              disabled={updateStatus.isPending}
                              className="inline-flex items-center gap-1.5 bg-[#27731E] text-white rounded-full px-4 py-1.5 font-body text-[13px] hover:bg-[#368B2B] transition-colors disabled:opacity-50"
                            >
                              <MailCheck size={14} />
                              Mark as Read
                            </button>
                          )}

                          {/* Archive — only show if not already archived */}
                          {msg.status !== "archived" && (
                            <button
                              onClick={() => updateStatus.mutate({ id: msg.id, status: "archived" })}
                              disabled={updateStatus.isPending}
                              className="inline-flex items-center gap-1.5 bg-[#e2e2e2] dark:bg-[#2d3a2b] text-[#40493c] dark:text-[#a8bca4] rounded-full px-4 py-1.5 font-body text-[13px] hover:bg-[#d0d0d0] dark:hover:bg-[#3a4a37] transition-colors disabled:opacity-50"
                            >
                              <Archive size={14} />
                              Archive
                            </button>
                          )}

                          {/* Reply via Email */}
                          <a
                            href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject)}`}
                            className="ml-auto inline-flex items-center gap-1.5 bg-white dark:bg-[#232a21] border border-[#27731E] text-[#27731E] rounded-full px-4 py-1.5 font-body text-[13px] hover:bg-[#27731E] hover:text-white transition-colors"
                          >
                            <Mail size={14} />
                            Reply via Email
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}

        {/* Search result count footer */}
        {search && !isLoading && messages.length > 0 && (
          <p className="mt-4 font-body text-[13px] text-[#a1a1a1] text-center">
            Showing {messages.length} of {allMessages.length} messages
          </p>
        )}
      </div>
    </div>
  );
}
