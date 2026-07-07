"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Send, X, MessageSquare, CheckCheck, Check } from "lucide-react";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { useTicketStream } from "@/hooks/use-ticket-stream";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TicketUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
};

type LastMessage = {
  content: string;
  senderType: "CUSTOMER" | "ADMIN";
  createdAt: string;
};

type AssignedAdmin = { id: string; name: string };

type TicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: "OPEN" | "RESOLVED" | "EXPIRED";
  lastActivityAt: string;
  expiresAt: string;
  createdAt: string;
  user: TicketUser;
  assignedAdmin: AssignedAdmin | null;
  messages: LastMessage[];
};

type TicketMessage = {
  id: string;
  senderType: "CUSTOMER" | "ADMIN";
  content: string;
  createdAt: string;
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
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  return formatDate(iso);
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Group messages by date for date separators
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
// Column 1 — Ticket list item
// ---------------------------------------------------------------------------
function TicketListItem({
  ticket,
  active,
  onClick,
}: {
  ticket: TicketSummary;
  active: boolean;
  onClick: () => void;
}) {
  const lastMsg = ticket.messages[0];
  const preview = lastMsg
    ? lastMsg.content.slice(0, 40) + (lastMsg.content.length > 40 ? "…" : "")
    : ticket.subject.slice(0, 40);

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-3 py-3.5 border-b border-(--neutral-100) dark:border-(--dark-border) hover:bg-(--neutral-50) dark:hover:bg-(--dark-border) transition-colors relative",
        active ? "bg-(--green-50) dark:bg-(--dark-border)" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <span className="font-dm text-[13px] font-semibold text-(--neutral-900) dark:text-(--dark-text) truncate">
          {ticket.user.name}
        </span>
        <span className="font-dm text-[11px] text-(--neutral-400) dark:text-(--dark-muted) shrink-0">
          {formatRelative(ticket.lastActivityAt)}
        </span>
      </div>
      <div className="font-dm text-[11px] text-(--neutral-400) dark:text-(--dark-muted) mb-1">
        {ticket.ticketNumber}
        {ticket.assignedAdmin && (
          <span className="ml-1.5 text-(--green-800) dark:text-green-400">
            · {ticket.assignedAdmin.name}
          </span>
        )}
      </div>
      <div className="font-dm text-[12px] text-(--neutral-500) dark:text-(--dark-muted) truncate">
        {preview}
      </div>
      {/* Active status dot */}
      {ticket.status === "OPEN" && (
        <span className="absolute top-3.5 right-3 w-2 h-2 rounded-full bg-(--success)" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Column 2 — Message bubble
// ---------------------------------------------------------------------------
function MessageBubble({
  message,
  isOptimistic,
}: {
  message: TicketMessage & { isOptimistic?: boolean };
  isOptimistic?: boolean;
}) {
  const isAdmin = message.senderType === "ADMIN";

  if (isAdmin) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] bg-(--green-800) rounded-[16px] rounded-tr-[4px] px-4 py-3">
          <p className="font-dm text-[14px] text-white leading-relaxed">{message.content}</p>
          <span className="font-dm text-[11px] text-white/60 mt-1 flex items-center justify-end gap-1">
            {formatTime(message.createdAt)}
            {isOptimistic ? (
              <Check size={12} />
            ) : (
              <CheckCheck size={12} />
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[70%] bg-white dark:bg-(--dark-surface) border border-(--neutral-200) dark:border-(--dark-border) rounded-[16px] rounded-tl-[4px] px-4 py-3 shadow-(--e1)">
        <p className="font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) leading-relaxed">
          {message.content}
        </p>
        <span className="font-dm text-[11px] text-(--neutral-400) dark:text-(--dark-muted) mt-1 block">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AdminTicketsClient() {
  const qc = useQueryClient();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved" | "expired">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Fetch admin/customer_care staff — populates the assignee filter dropdown
  // -------------------------------------------------------------------------
  const { data: staffData } = useQuery({
    queryKey: ["admin-staff-list"],
    queryFn: () => fetch("/api/admin/staff").then((r) => r.json()),
    staleTime: 5 * 60_000,
  });
  const staffList: { id: string; name: string }[] = (staffData?.data?.staff ?? []).map(
    (s: { id: string; name: string }) => ({ id: s.id, name: s.name })
  );

  // -------------------------------------------------------------------------
  // Fetch ticket list
  // -------------------------------------------------------------------------
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["admin-tickets", statusFilter, assigneeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (assigneeFilter !== "all") params.set("assignedAdminId", assigneeFilter);
      const qs = params.toString();
      return fetch(`/api/admin/tickets${qs ? `?${qs}` : ""}`).then((r) => r.json());
    },
    refetchInterval: 30_000,
  });

  const tickets: TicketSummary[] = listData?.data?.tickets ?? [];

  // Client-side search on the ticket list
  const filteredTickets = search.trim()
    ? tickets.filter(
        (t) =>
          t.user.name.toLowerCase().includes(search.toLowerCase()) ||
          t.ticketNumber.toLowerCase().includes(search.toLowerCase()) ||
          t.subject.toLowerCase().includes(search.toLowerCase())
      )
    : tickets;

  // -------------------------------------------------------------------------
  // Fetch active ticket detail
  // -------------------------------------------------------------------------
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["admin-ticket", activeTicketId],
    queryFn: () =>
      fetch(`/api/admin/tickets/${activeTicketId}`).then((r) => r.json()),
    enabled: !!activeTicketId,
    refetchInterval: 15_000,
  });

  const activeTicket: TicketDetail | null = detailData?.data?.ticket ?? null;

  // Real-time layer on top of the 15s poll above — invalidate as soon as a
  // reply lands on either side of the conversation, from either admin or
  // customer, so the thread updates without waiting for the next poll tick.
  useTicketStream(activeTicketId, () => {
    qc.invalidateQueries({ queryKey: ["admin-ticket", activeTicketId] });
    qc.invalidateQueries({ queryKey: ["admin-tickets"] });
  });

  // Auto-scroll to bottom when messages load or new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTicket?.messages?.length]);

  // Auto-select first ticket on list load
  useEffect(() => {
    if (!activeTicketId && filteredTickets.length > 0) {
      setActiveTicketId(filteredTickets[0].id);
    }
  }, [filteredTickets.length]);

  // -------------------------------------------------------------------------
  // Reply mutation with optimistic update
  // -------------------------------------------------------------------------
  const replyMutation = useMutation({
    mutationFn: (content: string) =>
      fetch(`/api/admin/tickets/${activeTicketId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }).then((r) => r.json()),

    onMutate: async (content) => {
      // Append optimistic message immediately
      const optimisticMsg: TicketMessage & { isOptimistic?: boolean } = {
        id: `optimistic-${Date.now()}`,
        senderType: "ADMIN",
        content,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
      };
      qc.setQueryData(
        ["admin-ticket", activeTicketId],
        (old: { data?: { ticket?: TicketDetail } } | undefined) => {
          if (!old?.data?.ticket) return old;
          return {
            ...old,
            data: {
              ...old.data,
              ticket: {
                ...old.data.ticket,
                messages: [...old.data.ticket.messages, optimisticMsg],
              },
            },
          };
        }
      );
    },

    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error?.message ?? "Failed to send reply");
      }
      // Refresh to replace optimistic with real message
      qc.invalidateQueries({ queryKey: ["admin-ticket", activeTicketId] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },

    onError: () => {
      toast.error("Failed to send reply");
      qc.invalidateQueries({ queryKey: ["admin-ticket", activeTicketId] });
    },
  });

  // -------------------------------------------------------------------------
  // Status mutation
  // -------------------------------------------------------------------------
  const statusMutation = useMutation({
    mutationFn: (status: "OPEN" | "RESOLVED") =>
      fetch(`/api/admin/tickets/${activeTicketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),

    onSuccess: (result) => {
      if (result.ok) {
        const newStatus = result.data.ticket.status;
        toast.success(
          newStatus === "RESOLVED" ? "Ticket marked as resolved" : "Ticket reopened"
        );
        qc.invalidateQueries({ queryKey: ["admin-ticket", activeTicketId] });
        qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      } else {
        toast.error(result.error?.message ?? "Failed to update status");
      }
    },

    onError: () => toast.error("Failed to update ticket status"),
  });

  function handleSend() {
    const text = replyText.trim();
    if (!text || !activeTicketId) return;
    setReplyText("");
    replyMutation.mutate(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  const messageGroups = activeTicket ? groupByDate(activeTicket.messages) : [];

  const STATUS_FILTERS = [
    { key: "all" as const, label: "All" },
    { key: "open" as const, label: "Open" },
    { key: "resolved" as const, label: "Resolved" },
    { key: "expired" as const, label: "Expired" },
  ];

  // -------------------------------------------------------------------------
  // Render — 3-column layout
  // -------------------------------------------------------------------------
  return (
    <div className="flex h-[calc(100vh-72px-57px)] overflow-hidden">

      {/* ------------------------------------------------------------------ */}
      {/* Column 1 — Ticket list (240px)                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-[240px] shrink-0 border-r border-(--neutral-200) dark:border-(--dark-border) flex flex-col bg-white dark:bg-(--dark-surface)">
        {/* Search */}
        <div className="p-3 border-b border-(--neutral-100) dark:border-(--dark-border)">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-(--neutral-400) pointer-events-none"
            />
            <input
              type="search"
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 bg-(--neutral-50) dark:bg-(--dark-bg) border border-(--neutral-200) dark:border-(--dark-border) rounded-full font-dm text-[13px] text-(--neutral-900) dark:text-(--dark-text) placeholder:text-(--neutral-400) focus:outline-none focus:border-(--green-800) transition-colors"
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1 px-2 py-2 border-b border-(--neutral-100) dark:border-(--dark-border) flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={[
                "h-6 px-2.5 rounded-full font-dm text-[11px] font-medium transition-colors",
                statusFilter === f.key
                  ? "bg-(--green-800) text-white"
                  : "bg-(--neutral-100) dark:bg-(--dark-border) text-(--neutral-500) dark:text-(--dark-muted) hover:bg-(--neutral-200)",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Assignee filter */}
        <div className="px-2 py-2 border-b border-(--neutral-100) dark:border-(--dark-border)">
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="w-full h-8 px-2 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg) font-dm text-[12px] text-(--neutral-700) dark:text-(--dark-text) focus:outline-none focus:border-(--green-800) transition-colors"
          >
            <option value="all">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-(--neutral-100) dark:bg-(--dark-border) rounded-[8px] animate-pulse" />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
              <MessageSquare size={32} className="text-(--neutral-300) mb-2" />
              <p className="font-dm text-[12px] text-(--neutral-400)">No tickets found</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => (
              <TicketListItem
                key={ticket.id}
                ticket={ticket}
                active={ticket.id === activeTicketId}
                onClick={() => setActiveTicketId(ticket.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Column 2 — Thread view (flex-1)                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0 bg-(--neutral-50) dark:bg-(--dark-bg)">
        {!activeTicket && !detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Select a ticket"
              description="Choose a support ticket from the list to view the conversation."
            />
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="h-14 shrink-0 flex items-center justify-between px-4 bg-white dark:bg-(--dark-surface) border-b border-(--neutral-200) dark:border-(--dark-border)">
              {detailLoading ? (
                <div className="h-5 w-48 bg-(--neutral-100) dark:bg-(--dark-border) rounded animate-pulse" />
              ) : activeTicket ? (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-dm text-[13px] font-semibold text-(--neutral-400) shrink-0">
                      {activeTicket.ticketNumber}
                    </span>
                    <StatusPill status={activeTicket.status.toLowerCase()} />
                    <span className="font-dm text-[14px] font-medium text-(--neutral-900) dark:text-(--dark-text) truncate">
                      {activeTicket.subject}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      statusMutation.mutate(
                        activeTicket.status === "RESOLVED" ? "OPEN" : "RESOLVED"
                      )
                    }
                    disabled={
                      statusMutation.isPending ||
                      activeTicket.status === "EXPIRED"
                    }
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-[6px] text-(--neutral-500) hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={
                      activeTicket.status === "RESOLVED"
                        ? "Reopen ticket"
                        : "Close ticket"
                    }
                  >
                    <X size={16} />
                  </button>
                </>
              ) : null}
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {detailLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
                    >
                      <div className="h-16 w-64 bg-(--neutral-200) dark:bg-(--dark-border) rounded-[16px] animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {messageGroups.map((group) => (
                    <div key={group.date}>
                      {/* Date separator */}
                      <div className="flex items-center justify-center my-4">
                        <span className="font-dm text-[11px] text-(--neutral-400) bg-(--neutral-200) dark:bg-(--dark-border) rounded-full px-3 py-1">
                          {group.date}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {group.messages.map((msg) => (
                          <MessageBubble
                            key={msg.id}
                            message={msg as TicketMessage & { isOptimistic?: boolean }}
                            isOptimistic={(msg as TicketMessage & { isOptimistic?: boolean }).isOptimistic}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Compose area */}
            <div className="shrink-0 border-t border-(--neutral-200) dark:border-(--dark-border) p-3 bg-white dark:bg-(--dark-surface)">
              {activeTicket?.status === "EXPIRED" ? (
                <div className="text-center py-2">
                  <p className="font-dm text-[13px] text-(--neutral-400)">
                    This ticket has expired.{" "}
                    <button
                      onClick={() => statusMutation.mutate("OPEN")}
                      className="text-(--green-800) underline hover:no-underline"
                    >
                      Reopen it
                    </button>{" "}
                    to reply.
                  </p>
                </div>
              ) : activeTicket?.status === "RESOLVED" ? (
                <div className="text-center py-2">
                  <p className="font-dm text-[13px] text-(--neutral-400)">
                    Ticket resolved.{" "}
                    <button
                      onClick={() => statusMutation.mutate("OPEN")}
                      className="text-(--green-800) underline hover:no-underline"
                    >
                      Reopen
                    </button>{" "}
                    to send a reply.
                  </p>
                </div>
              ) : (
                <div className="flex gap-2 items-end">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a reply... (Ctrl+Enter to send)"
                    rows={2}
                    className="flex-1 resize-none rounded-[10px] border border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg) px-3 py-2 font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) placeholder:text-(--neutral-400) min-h-[40px] max-h-[120px] focus:border-(--green-800) focus:outline-none transition-colors"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    className="w-10 h-10 rounded-full bg-(--green-800) text-white flex items-center justify-center hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
                  >
                    <Send size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Column 3 — Customer + ticket info (280px)                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-[280px] shrink-0 border-l border-(--neutral-200) dark:border-(--dark-border) bg-(--neutral-50) dark:bg-(--dark-bg) flex flex-col overflow-y-auto">
        {activeTicket ? (
          <>
            {/* Customer info */}
            <div className="p-4 border-b border-(--neutral-200) dark:border-(--dark-border)">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-(--green-50) dark:bg-(--dark-border) text-(--green-800) dark:text-(--dark-text) flex items-center justify-center font-dm font-semibold text-[18px]">
                  {initials(activeTicket.user.name)}
                </div>
                <div>
                  <div className="font-syne text-[16px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                    {activeTicket.user.name}
                  </div>
                  <div className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted) mt-0.5">
                    {activeTicket.user.email}
                  </div>
                  {activeTicket.user.phone && (
                    <div className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
                      {activeTicket.user.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ticket info */}
            <div className="p-4 border-b border-(--neutral-200) dark:border-(--dark-border) space-y-3">
              <div className="font-dm text-[11px] font-semibold uppercase tracking-wider text-(--neutral-400) dark:text-(--dark-muted)">
                Ticket Details
              </div>
              {[
                { label: "Ticket", value: activeTicket.ticketNumber },
                { label: "Subject", value: activeTicket.subject },
                { label: "Assigned to", value: activeTicket.assignedAdmin?.name ?? "Unassigned" },
                { label: "Created", value: formatDate(activeTicket.createdAt) },
                { label: "Last Activity", value: formatDate(activeTicket.lastActivityAt) },
                { label: "Expires", value: formatDate(activeTicket.expiresAt) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="font-dm text-[11px] text-(--neutral-400) dark:text-(--dark-muted)">{label}</div>
                  <div className="font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text) mt-0.5 font-medium">
                    {value}
                  </div>
                </div>
              ))}
              <div>
                <div className="font-dm text-[11px] text-(--neutral-400) dark:text-(--dark-muted) mb-1">Status</div>
                <StatusPill status={activeTicket.status.toLowerCase()} />
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 space-y-2">
              <div className="font-dm text-[11px] font-semibold uppercase tracking-wider text-(--neutral-400) dark:text-(--dark-muted) mb-3">
                Actions
              </div>

              {activeTicket.status !== "RESOLVED" && (
                <button
                  onClick={() => statusMutation.mutate("RESOLVED")}
                  disabled={statusMutation.isPending || activeTicket.status === "EXPIRED"}
                  className="w-full h-10 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  Mark Resolved
                </button>
              )}

              {activeTicket.status === "RESOLVED" && (
                <button
                  onClick={() => statusMutation.mutate("OPEN")}
                  disabled={statusMutation.isPending}
                  className="w-full h-10 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) text-(--neutral-700) dark:text-(--dark-text) font-dm text-[14px] font-medium hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) disabled:opacity-50 transition-colors"
                >
                  Reopen Ticket
                </button>
              )}

              {activeTicket.status === "EXPIRED" && (
                <button
                  onClick={() => statusMutation.mutate("OPEN")}
                  disabled={statusMutation.isPending}
                  className="w-full h-10 rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) text-(--neutral-700) dark:text-(--dark-text) font-dm text-[14px] font-medium hover:bg-(--neutral-100) dark:hover:bg-(--dark-border) disabled:opacity-50 transition-colors"
                >
                  Reopen Ticket
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="font-dm text-[13px] text-(--neutral-400) text-center">
              Select a ticket to see details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
