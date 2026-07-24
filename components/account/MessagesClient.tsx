"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Send, Plus, X, Paperclip, FileText } from "lucide-react";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { useTicketStream } from "@/hooks/use-ticket-stream";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "application/pdf"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TicketMessage = {
  id: string;
  senderType: "CUSTOMER" | "ADMIN";
  content: string;
  createdAt: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
};

type TicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: "OPEN" | "RESOLVED" | "EXPIRED";
  lastActivityAt: string;
  createdAt: string;
  messages: {
    content: string;
    senderType: "CUSTOMER" | "ADMIN";
    createdAt: string;
    attachmentName?: string | null;
  }[];
};

type TicketDetail = TicketSummary & {
  messages: TicketMessage[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  return formatDate(iso);
}

function groupByDate(messages: TicketMessage[]) {
  const groups: { date: string; messages: TicketMessage[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const d = new Date(msg.createdAt).toDateString();
    if (d !== currentDate) {
      currentDate = d;
      groups.push({ date: d, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// New ticket modal
// ---------------------------------------------------------------------------
function NewTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), content: content.trim() }),
      }).then((r) => r.json()),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Support ticket created");
        onCreated(result.data.ticket.id);
      } else {
        toast.error(result.error?.message ?? "Failed to create ticket");
      }
    },
    onError: () => toast.error("Failed to create ticket"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
      <div className="w-full max-w-[480px] bg-white rounded-[16px] shadow-[0_24px_64px_rgba(0,0,0,0.16)] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-syne text-[20px] font-semibold text-(--neutral-900)">
            New Support Ticket
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-[6px] text-(--neutral-500) hover:bg-(--neutral-100) transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1.5">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What do you need help with?"
              className="w-full h-11 px-4 rounded-[10px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:border-(--green-800) transition-colors"
            />
          </div>
          <div>
            <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1.5">
              Message
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe your issue in detail..."
              rows={5}
              className="w-full px-4 py-3 rounded-[10px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:border-(--green-800) resize-none transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-[10px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={
              !subject.trim() ||
              content.trim().length < 10 ||
              createMutation.isPending
            }
            className="flex-1 h-11 rounded-[10px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {createMutation.isPending ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble — customer POV: CUSTOMER = right/green, ADMIN = left/white
// ---------------------------------------------------------------------------
function MessageAttachment({ message, isCustomer }: { message: TicketMessage; isCustomer: boolean }) {
  if (!message.attachmentUrl) return null;
  const isImage = message.attachmentType?.startsWith("image/");

  if (isImage) {
    return (
      <a
        href={message.attachmentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block mb-2 rounded-[10px] overflow-hidden max-w-[220px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={message.attachmentUrl} alt={message.attachmentName ?? "Attachment"} className="w-full h-auto block" />
      </a>
    );
  }

  return (
    <a
      href={message.attachmentUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "flex items-center gap-2 mb-2 px-3 py-2 rounded-[10px] transition-colors",
        isCustomer ? "bg-white/15 hover:bg-white/25" : "bg-(--neutral-100) hover:bg-(--neutral-200)",
      ].join(" ")}
    >
      <FileText size={16} className={isCustomer ? "text-white shrink-0" : "text-(--green-800) shrink-0"} />
      <span className={["font-dm text-[13px] truncate", isCustomer ? "text-white" : "text-(--neutral-900)"].join(" ")}>
        {message.attachmentName ?? "Attachment"}
      </span>
    </a>
  );
}

function MessageBubble({ message }: { message: TicketMessage & { isOptimistic?: boolean } }) {
  const isCustomer = message.senderType === "CUSTOMER";

  if (isCustomer) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] bg-(--green-800) rounded-[16px] rounded-tr-[4px] px-4 py-3">
          <MessageAttachment message={message} isCustomer />
          {message.content && (
            <p className="font-dm text-[14px] text-white leading-relaxed">{message.content}</p>
          )}
          <span className="font-dm text-[11px] text-white/60 mt-1 block text-right">
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[70%] bg-white border border-(--neutral-200) rounded-[16px] rounded-tl-[4px] px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="font-dm text-[11px] text-(--green-800) font-semibold mb-1">Fechi Organics Support</div>
        <MessageAttachment message={message} isCustomer={false} />
        {message.content && (
          <p className="font-dm text-[14px] text-(--neutral-900) leading-relaxed">{message.content}</p>
        )}
        <span className="font-dm text-[11px] text-(--neutral-400) mt-1 block">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function MessagesClient() {
  const qc = useQueryClient();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      toast.error("Only images and PDFs can be attached");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("File exceeds 10 MB");
      return;
    }
    setPendingFile(file);
  }

  // -------------------------------------------------------------------------
  // Fetch ticket list
  // -------------------------------------------------------------------------
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => fetch("/api/tickets").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const tickets: TicketSummary[] = listData?.data?.tickets ?? [];

  // -------------------------------------------------------------------------
  // Fetch active ticket
  // -------------------------------------------------------------------------
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["my-ticket", activeTicketId],
    queryFn: () =>
      fetch(`/api/tickets/${activeTicketId}`).then((r) => r.json()),
    enabled: !!activeTicketId,
    refetchInterval: 15_000,
  });

  const activeTicket: TicketDetail | null = detailData?.data?.ticket ?? null;

  // Real-time layer on top of the 15s poll above — invalidate as soon as a
  // reply lands (from the admin's side, most of the time) so the thread
  // updates without waiting for the next poll tick.
  useTicketStream(activeTicketId, () => {
    qc.invalidateQueries({ queryKey: ["my-ticket", activeTicketId] });
    qc.invalidateQueries({ queryKey: ["my-tickets"] });
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTicket?.messages?.length]);

  // Auto-select first ticket
  useEffect(() => {
    if (!activeTicketId && tickets.length > 0) {
      setActiveTicketId(tickets[0].id);
    }
  }, [tickets.length]);

  // -------------------------------------------------------------------------
  // Reply mutation
  // -------------------------------------------------------------------------
  const replyMutation = useMutation({
    mutationFn: ({ content, file }: { content: string; file: File | null }) => {
      const fd = new FormData();
      if (content) fd.append("content", content);
      if (file) fd.append("file", file);
      return fetch(`/api/tickets/${activeTicketId}/reply`, {
        method: "POST",
        body: fd,
      }).then((r) => r.json());
    },

    onMutate: async ({ content, file }) => {
      const optimistic = {
        id: `opt-${Date.now()}`,
        senderType: "CUSTOMER" as const,
        content,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
        attachmentUrl: file ? URL.createObjectURL(file) : null,
        attachmentName: file?.name ?? null,
        attachmentType: file?.type ?? null,
      };
      qc.setQueryData(
        ["my-ticket", activeTicketId],
        (old: { data?: { ticket?: TicketDetail } } | undefined) => {
          if (!old?.data?.ticket) return old;
          return {
            ...old,
            data: {
              ...old.data,
              ticket: {
                ...old.data.ticket,
                messages: [...old.data.ticket.messages, optimistic],
              },
            },
          };
        }
      );
    },

    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error?.message ?? "Failed to send message");
      }
      qc.invalidateQueries({ queryKey: ["my-ticket", activeTicketId] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },

    onError: () => {
      toast.error("Failed to send message");
      qc.invalidateQueries({ queryKey: ["my-ticket", activeTicketId] });
    },
  });

  function handleSend() {
    const text = replyText.trim();
    if ((!text && !pendingFile) || !activeTicketId) return;
    setReplyText("");
    const file = pendingFile;
    setPendingFile(null);
    replyMutation.mutate({ content: text, file });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  const messageGroups = activeTicket ? groupByDate(activeTicket.messages) : [];

  const canReply =
    activeTicket?.status === "OPEN";

  return (
    <>
      <div className="flex h-[calc(100vh-260px)] min-h-[560px] rounded-2xl border border-(--neutral-200) overflow-hidden bg-white">

        {/* ---------------------------------------------------------------- */}
        {/* Column 1 — Ticket list (280px)                                   */}
        {/* ---------------------------------------------------------------- */}
        <div className="w-[280px] shrink-0 border-r border-(--neutral-200) flex flex-col">
          {/* Header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-(--neutral-200)">
            <span className="font-syne text-[16px] font-semibold text-(--neutral-900)">Messages</span>
            <button
              onClick={() => setShowNewModal(true)}
              className="w-8 h-8 flex items-center justify-center rounded-[6px] bg-(--green-800) text-white hover:opacity-90 transition-opacity"
              title="New ticket"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 bg-(--neutral-100) rounded-[8px] animate-pulse" />
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3">
                <MessageSquare size={36} className="text-(--neutral-300)" />
                <p className="font-dm text-[13px] text-(--neutral-500)">No messages yet</p>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="h-9 px-4 rounded-full bg-(--green-800) text-white font-dm text-[13px] font-medium hover:opacity-90 transition-opacity"
                >
                  Start a conversation
                </button>
              </div>
            ) : (
              tickets.map((ticket) => {
                const lastMsg = ticket.messages[0];
                const previewText = lastMsg
                  ? lastMsg.content || (lastMsg.attachmentName ? `📎 ${lastMsg.attachmentName}` : "")
                  : ticket.subject;
                const preview = previewText.slice(0, 42) + (previewText.length > 42 ? "…" : "");
                const active = ticket.id === activeTicketId;

                return (
                  <button
                    key={ticket.id}
                    onClick={() => setActiveTicketId(ticket.id)}
                    className={[
                      "w-full text-left px-4 py-3.5 border-b border-(--neutral-100) transition-colors",
                      active ? "bg-(--green-50)" : "hover:bg-(--neutral-50)",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-dm text-[13px] font-semibold text-(--neutral-900) truncate">
                        {ticket.subject}
                      </span>
                      <span className="font-dm text-[11px] text-(--neutral-400) shrink-0">
                        {formatRelative(ticket.lastActivityAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-dm text-[12px] text-(--neutral-500) truncate">
                        {preview}
                      </span>
                      <StatusPill status={ticket.status.toLowerCase()} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Column 2 — Thread view (flex-1)                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#f7f8f7]">
          {!activeTicket && !detailLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <MessageSquare size={48} className="text-(--neutral-300)" />
              <p className="font-dm text-[15px] text-(--neutral-500)">
                Select a conversation or start a new one
              </p>
              <button
                onClick={() => setShowNewModal(true)}
                className="h-10 px-5 rounded-full bg-(--green-800) text-white font-dm text-[14px] font-medium hover:opacity-90 transition-opacity"
              >
                New Message
              </button>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="h-14 shrink-0 flex items-center px-4 bg-white border-b border-(--neutral-200) gap-3">
                {detailLoading ? (
                  <div className="h-5 w-48 bg-(--neutral-100) rounded animate-pulse" />
                ) : activeTicket ? (
                  <>
                    <span className="font-dm text-[11px] text-(--neutral-400) font-mono">
                      {activeTicket.ticketNumber}
                    </span>
                    <span className="font-dm text-[14px] font-semibold text-(--neutral-900) truncate flex-1">
                      {activeTicket.subject}
                    </span>
                    <StatusPill status={activeTicket.status.toLowerCase()} />
                  </>
                ) : null}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {detailLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                        <div className="h-16 w-56 bg-(--neutral-200) rounded-[16px] animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {messageGroups.map((group) => (
                      <div key={group.date}>
                        <div className="flex items-center justify-center my-4">
                          <span className="font-dm text-[11px] text-(--neutral-400) bg-(--neutral-200) rounded-full px-3 py-1">
                            {group.date}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2">
                          {group.messages.map((msg) => (
                            <MessageBubble
                              key={msg.id}
                              message={msg as TicketMessage & { isOptimistic?: boolean }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Compose */}
              <div className="shrink-0 border-t border-(--neutral-200) p-3 bg-white">
                {canReply ? (
                  <div className="flex flex-col gap-2">
                    {pendingFile && (
                      <div className="flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-(--neutral-100) max-w-full">
                        <FileText size={14} className="text-(--neutral-500) shrink-0" />
                        <span className="font-dm text-[12px] text-(--neutral-700) truncate">{pendingFile.name}</span>
                        <button
                          onClick={() => setPendingFile(null)}
                          className="text-(--neutral-400) hover:text-(--neutral-700) shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2 items-end">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach a file"
                        className="w-10 h-10 rounded-full border border-(--neutral-200) text-(--neutral-500) flex items-center justify-center hover:bg-(--neutral-50) transition-colors shrink-0"
                      >
                        <Paperclip size={16} />
                      </button>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message... (Ctrl+Enter to send)"
                        rows={2}
                        className="flex-1 resize-none rounded-[10px] border border-(--neutral-200) bg-(--neutral-50) px-3 py-2 font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) min-h-[40px] max-h-[120px] focus:border-(--green-800) focus:outline-none transition-colors"
                      />
                      <button
                        onClick={handleSend}
                        disabled={(!replyText.trim() && !pendingFile) || replyMutation.isPending}
                        className="w-10 h-10 rounded-full bg-(--green-800) text-white flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-center font-dm text-[13px] text-(--neutral-400) py-1">
                    {activeTicket?.status === "RESOLVED"
                      ? "This conversation has been resolved."
                      : "This ticket has expired. Please open a new one."}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* New ticket modal */}
      {showNewModal && (
        <NewTicketModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false);
            qc.invalidateQueries({ queryKey: ["my-tickets"] });
            setActiveTicketId(id);
          }}
        />
      )}
    </>
  );
}
