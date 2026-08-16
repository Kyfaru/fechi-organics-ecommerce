"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";

const GREETINGS = ["Hi", "Hello", "Dear", "Good day"];
type Channel = "SMS" | "INBOX" | "EMAIL";
const ALL_CHANNELS: Channel[] = ["SMS", "INBOX", "EMAIL"];

export function ContactCustomerPanel({
  orderId,
  hasPhone,
  hasEmail,
  isGuest,
}: {
  orderId: string;
  hasPhone: boolean;
  hasEmail: boolean;
  isGuest: boolean;
}) {
  const [channels, setChannels] = useState<Set<Channel>>(new Set());
  const [greeting, setGreeting] = useState<string>(GREETINGS[0]);
  const [useCustomGreeting, setUseCustomGreeting] = useState(false);
  const [customGreeting, setCustomGreeting] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const availability: Record<Channel, boolean> = { SMS: hasPhone, INBOX: !isGuest, EMAIL: hasEmail };
  const unavailableReason: Record<Channel, string> = {
    SMS: "No phone on file",
    INBOX: "Guest order — no account inbox",
    EMAIL: "No email on file",
  };
  const effectiveGreeting = useCustomGreeting ? customGreeting.trim() : greeting;

  function toggle(channel: Channel) {
    if (!availability[channel]) return;
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  function toggleAll() {
    const available = ALL_CHANNELS.filter((c) => availability[c]);
    const allSelected = available.length > 0 && available.every((c) => channels.has(c));
    setChannels(allSelected ? new Set() : new Set(available));
  }

  async function handleSend() {
    if (channels.size === 0) return toast.error("Select at least one channel");
    if (!effectiveGreeting) return toast.error("Enter a greeting");
    if (body.trim().length === 0) return toast.error("Write a message");

    setSending(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: Array.from(channels), greeting: effectiveGreeting, body: body.trim() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to send");

      const results = json.data.results as { channel: Channel; ok: boolean; error?: string }[];
      const sent = results.filter((r) => r.ok).map((r) => r.channel);
      const failed = results.filter((r) => !r.ok);

      if (sent.length > 0) {
        toast.success(
          `Sent via ${sent.join(" and ")}`,
          failed.length > 0 ? { message: `${failed.map((f) => f.channel).join(", ")} unavailable` } : undefined,
        );
        setBody("");
        setChannels(new Set());
      } else {
        toast.error("Message could not be sent on any channel");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white rounded-[10px] p-4 border border-(--neutral-200)">
      <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-3">Contact Customer</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {ALL_CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            disabled={!availability[c]}
            title={!availability[c] ? unavailableReason[c] : undefined}
            className={`px-3 h-8 rounded-full font-dm text-[12px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              channels.has(c)
                ? "bg-(--green-800) text-white border-(--green-800)"
                : "border-(--neutral-200) text-(--neutral-700) hover:bg-(--neutral-50)"
            }`}
          >
            {c === "SMS" ? "SMS" : c === "INBOX" ? "Inbox" : "Email"}
          </button>
        ))}
        <button
          type="button"
          onClick={toggleAll}
          className="px-3 h-8 rounded-full font-dm text-[12px] font-medium border border-(--neutral-200) text-(--neutral-500) hover:bg-(--neutral-50) transition-colors"
        >
          All
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select
          value={useCustomGreeting ? "custom" : greeting}
          onChange={(e) => {
            if (e.target.value === "custom") setUseCustomGreeting(true);
            else { setUseCustomGreeting(false); setGreeting(e.target.value); }
          }}
          className="h-9 px-2 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) bg-white"
        >
          {GREETINGS.map((g) => <option key={g} value={g}>{g}</option>)}
          <option value="custom">Custom…</option>
        </select>
        {useCustomGreeting && (
          <input
            value={customGreeting}
            onChange={(e) => setCustomGreeting(e.target.value)}
            placeholder="Custom greeting"
            className="flex-1 h-9 px-3 rounded-[8px] border border-(--neutral-200) font-dm text-[13px]"
          />
        )}
      </div>

      <div className="bg-(--neutral-50) rounded-[8px] p-3 border border-(--neutral-200) mb-1">
        <p className="font-dm text-[12px] text-(--neutral-400) italic">{effectiveGreeting || "…"} {"{Customer}"},</p>
        <textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          placeholder="Write your message…"
          className="w-full mt-1 font-dm text-[13px] text-(--neutral-900) bg-transparent resize-none outline-none placeholder:text-(--neutral-400)"
        />
        <p className="font-dm text-[12px] text-(--neutral-400) italic mt-1">— The Fechi Organics Team · fechiorganics.shop/contact</p>
      </div>
      <p className="font-dm text-[11px] text-(--neutral-400) mb-3 text-right">{body.length}/2000</p>

      <button
        onClick={handleSend}
        disabled={sending || channels.size === 0}
        className="w-full h-10 rounded-[8px] bg-(--green-800) hover:bg-(--green-900) font-dm text-[13px] font-medium text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? <Spinner size={13} /> : <Icon icon="lucide:send" width={14} />}
        Send Message
      </button>
    </div>
  );
}
