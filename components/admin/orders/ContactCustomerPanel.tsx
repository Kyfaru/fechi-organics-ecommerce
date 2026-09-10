"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";

const GREETINGS = ["Hi", "Hello", "Dear", "Good day"];
type Channel = "SMS" | "INBOX" | "EMAIL";
const ALL_CHANNELS: Channel[] = ["SMS", "INBOX", "EMAIL"];

export type OrderOutcome = "success" | "failed" | "neutral";

// Body-only presets — greeting/name and the signature+link are already
// composed separately (lib/orders/build-contact-message.ts) — these just
// prefill the textarea, still freely editable after. Kept under 150 chars.
const TEMPLATES: Record<Exclude<OrderOutcome, "neutral">, { label: string; text: string }[]> = {
  failed: [
    { label: "Enquire", text: "We noticed your payment didn't go through — could you let us know what happened on your end?" },
    { label: "Offer help", text: "Sorry your payment failed. We're happy to help sort it out — just reply here or give us a call." },
    { label: "Ask feedback", text: "We're sorry your order didn't complete. What could we improve to make checkout easier next time?" },
  ],
  success: [
    { label: "Thank you", text: "Thank you for shopping with us! We hope you love your order — explore more of our range anytime." },
    { label: "Coupon offer", text: "Thanks for your order! Here's a treat: use code THANKYOU10 for 10% off your next purchase." },
    { label: "Feedback", text: "Thank you! We'd love to hear your feedback on your recent order — it helps us keep improving." },
  ],
};

// In-store success templates skip the "browse online" framing (there's no
// online cart to return to for a walk-in) in favor of a branch-visit note.
const INSTORE_SUCCESS_TEMPLATES = [
  { label: "Thank you", text: "Thank you for shopping with us in-store! You can always pass by any of our branches for any enquiry." },
  { label: "Coupon offer", text: "Thanks for visiting us! Here's a treat: use code THANKYOU10 for 10% off your next purchase." },
  { label: "Feedback", text: "Thank you! We'd love to hear your feedback on your in-store experience — it helps us keep improving." },
];

export function ContactCustomerPanel({
  orderId,
  hasPhone,
  hasEmail,
  isGuest,
  orderOutcome,
  isInStore = false,
}: {
  orderId: string;
  hasPhone: boolean;
  hasEmail: boolean;
  isGuest: boolean;
  orderOutcome: OrderOutcome;
  /** In-store orders post to a different endpoint and get a branch-visit-
   * flavored success template set instead of the "continue shopping" one. */
  isInStore?: boolean;
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
  const templates =
    orderOutcome === "neutral" ? null : orderOutcome === "success" && isInStore ? INSTORE_SUCCESS_TEMPLATES : TEMPLATES[orderOutcome];
  const linkPreview = orderOutcome === "success" && !isInStore ? "fechiorganics.shop/shop" : "fechiorganics.shop/contact";
  const apiPath = isInStore ? `/api/admin/orders/instore/${orderId}/contact` : `/api/admin/orders/${orderId}/contact`;

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
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: Array.from(channels), greeting: effectiveGreeting, body: body.trim() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed to send");

      if (json.data.submittedForApproval) {
        toast.success("Submitted for approval", { message: "A super admin, admin, or customer care staff needs to approve this before it's sent." });
        setBody("");
        setChannels(new Set());
        return;
      }

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
    <div className="bg-white rounded-xl border border-(--neutral-200) shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-6 py-4 border-b border-(--neutral-100) bg-(--neutral-50)/50">
        <p className="font-dm text-[11px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px]">Contact Customer</p>
      </div>
      <div className="p-6">
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

        {templates && (
          <div className="flex flex-wrap gap-2 mb-3">
            {templates.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setBody(t.text)}
                className="px-3 h-7 rounded-full border border-(--neutral-200) bg-(--neutral-50) font-dm text-[11px] font-medium text-(--neutral-700) hover:bg-(--neutral-100) transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

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
          <p className="font-dm text-[12px] text-(--neutral-400) italic mt-1">— The Fechi Organics Team · {linkPreview}</p>
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
    </div>
  );
}
