"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar } from "lucide-react";

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen datetime once the admin confirms. This component
   *  only picks a date/time — the parent owns saving the post and calling
   *  the publish API, since it already holds the rest of the form state. */
  onConfirm: (scheduledAt: Date) => void;
  loading?: boolean;
}

// NOTE: this component keeps its own date/time/error state across
// open -> close, so the parent should render it with a `key` that changes
// every time it's reopened (e.g. bump a counter alongside setOpen(true)) —
// that remounts a fresh instance instead of needing an effect that clears
// state on every `open` transition (React's own guidance against
// setState-in-effect for this exact "reset on reopen" case).

type DatepickerChangePayload = {
  selectedDates: string[];
};

const inputCls =
  "w-full h-10 px-3 rounded-[8px] border border-(--neutral-200) bg-white font-dm text-[14px] text-(--neutral-900) placeholder:text-(--neutral-400) focus:outline-none focus:ring-2 focus:ring-(--green-500) focus:border-transparent transition-shadow";

/**
 * Date + time picker for scheduling a blog post to auto-publish later.
 *
 * Built on Preline's real JS calendar (vanilla-calendar-pro under the hood,
 * wired via data-hs-datepicker — see node_modules/preline/dist/datepicker.d.ts
 * for the option shape). Every other date field in this admin
 * (components/admin/ui/PrelineDatePicker.tsx, AdminCampaignsClient's send
 * modal) is a plain native <input type="date"|"datetime-local">, so this is
 * the first real use of the Preline calendar bundle in the codebase.
 *
 * Time is deliberately a separate plain <input type="time"> rather than
 * configuring vanilla-calendar-pro's embedded time picker (which needs a
 * custom `layouts` template to render) — one date field + one time field is
 * simpler to combine into a single Date and validate.
 *
 * We instantiate `new HSDatepicker(el, options)` explicitly on mount, the
 * same way components/auth/OtpPinInput.tsx instantiates `new HSPinInput(el)`,
 * rather than relying on the blanket HSStaticMethods.autoInit() in
 * components/admin/PrelineInit.tsx — that effect reflows the entire page on
 * every route change and only scans the DOM once per pathname, so it would
 * never see this input, which mounts and unmounts inside a modal without a
 * route change.
 */
export default function ScheduleModal({ open, onClose, onConfirm, loading = false }: ScheduleModalProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const instanceRef = useRef<{ destroy: () => void } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(""); // "yyyy-mm-dd", read from the calendar's change event
  const [time, setTime] = useState<string>("09:00");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // preline/plugins/datepicker is a side-effect-only bundle with no real ES
    // export — like preline/plugins/pin-input, it just assigns
    // `window.HSDatepicker` (meant to be loaded like a <script> tag), so the
    // constructor has to be read off `window` after the import's side effect runs.
    import("preline/plugins/datepicker")
      .then(() => {
        if (cancelled || !dateInputRef.current) return;
        const HSDatepicker = (
          window as unknown as {
            HSDatepicker?: new (el: HTMLElement, options?: Record<string, unknown>) => { destroy: () => void };
          }
        ).HSDatepicker;
        if (!HSDatepicker) return;
        const today = new Date();
        // Block picking a day in the past directly in the calendar UI — the
        // future-datetime check on confirm is the real guard (time-of-day
        // still needs validating even when today is picked).
        const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
          today.getDate()
        ).padStart(2, "0")}`;
        instanceRef.current = new HSDatepicker(dateInputRef.current, {
          type: "default",
          applyUtilityClasses: true,
          dateFormat: "yyyy-mm-dd",
          dateMin: minDate,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    const el = dateInputRef.current;
    if (!el) return;
    function handleChange(e: Event) {
      const payload = (e as CustomEvent).detail?.payload as DatepickerChangePayload | undefined;
      const picked = payload?.selectedDates?.[0];
      if (picked) setSelectedDate(picked);
    }
    el.addEventListener("change.hs.datepicker", handleChange);
    return () => el.removeEventListener("change.hs.datepicker", handleChange);
  }, []);

  function handleConfirm() {
    if (!selectedDate) {
      setError("Pick a date");
      return;
    }
    const scheduledAt = new Date(`${selectedDate}T${time}:00`);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      setError("Pick a future date and time");
      return;
    }
    setError(null);
    onConfirm(scheduledAt);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/45 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[420px] bg-white dark:bg-(--dark-surface) rounded-[12px] shadow-(--e3) z-50 p-6"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-(--gold-50)">
                <Calendar size={18} className="text-(--gold-700)" />
              </div>
              <div>
                <h3 className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
                  Schedule post
                </h3>
                <p className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted)">
                  Publishes automatically at the chosen time
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">Date</label>
                {/* Uncontrolled on purpose — HSDatepicker writes this input's
                    value directly via the DOM; the picked date lives in
                    `selectedDate` state (from the change.hs.datepicker
                    listener above), not in a React `value` prop, so React
                    never fights the library over this field. */}
                <input
                  ref={dateInputRef}
                  type="text"
                  readOnly
                  placeholder="Select date"
                  className={`${inputCls} cursor-pointer`}
                />
              </div>
              <div>
                <label className="block font-dm text-[13px] font-medium text-(--neutral-700) mb-1.5">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {error && <p className="font-dm text-[12px] text-(--danger) mt-2">{error}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="h-10 px-5 rounded-[8px] border border-(--neutral-200) font-dm text-[14px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors disabled:opacity-60"
              >
                {loading ? "Scheduling…" : "Schedule"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
