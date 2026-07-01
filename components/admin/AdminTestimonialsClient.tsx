"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star,
  Trash2,
  Plus,
  Upload,
  AlertCircle,
  MessageSquare,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Drawer } from "@/components/admin/ui/Drawer";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import Switch from "@/components/ui/Switch";
import CircularProgress from "@/components/ui/CircularProgress";

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
  // Added by the GET handler via r2PublicUrl()
  beforeUrl: string | null;
  afterUrl: string | null;
  source: "facebook" | "manual";
  approved: boolean;
  sortOrder: number;
  createdAt: string;
};

type ApiResponse = {
  ok: boolean;
  data: { testimonials: Testimonial[] };
};

// Form state for the Add drawer
type DrawerForm = {
  authorName: string;
  location: string;
  quote: string;
  rating: number;
  beforeKey: string | null;
  afterKey: string | null;
  source: "facebook" | "manual";
};

function blankForm(): DrawerForm {
  return {
    authorName: "",
    location: "",
    quote: "",
    rating: 5,
    beforeKey: null,
    afterKey: null,
    source: "manual",
  };
}

// ---------------------------------------------------------------------------
// Shared style constants — mirror AdminProductsClient conventions
// ---------------------------------------------------------------------------
const inputCls =
  "w-full font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) px-3 py-2 focus:outline-none focus:border-(--green-800) transition-colors placeholder:text-(--neutral-400)";

const labelCls =
  "block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5";

// ---------------------------------------------------------------------------
// Skeleton card — 6 placeholders during initial load
// ---------------------------------------------------------------------------
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex justify-between gap-2">
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-3.5 bg-(--neutral-100) dark:bg-(--dark-border) rounded w-2/3" />
          <div className="h-3 bg-(--neutral-100) dark:bg-(--dark-border) rounded w-1/3" />
        </div>
        <div className="h-5 w-16 bg-(--neutral-100) dark:bg-(--dark-border) rounded-full" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-3.5 h-3.5 rounded bg-(--neutral-100) dark:bg-(--dark-border)" />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-3 bg-(--neutral-100) dark:bg-(--dark-border) rounded w-full" />
        <div className="h-3 bg-(--neutral-100) dark:bg-(--dark-border) rounded w-5/6" />
        <div className="h-3 bg-(--neutral-100) dark:bg-(--dark-border) rounded w-3/4" />
        <div className="h-3 bg-(--neutral-100) dark:bg-(--dark-border) rounded w-1/2" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 aspect-[4/3] bg-(--neutral-100) dark:bg-(--dark-border) rounded-[8px]" />
        <div className="flex-1 aspect-[4/3] bg-(--neutral-100) dark:bg-(--dark-border) rounded-[8px]" />
      </div>
      <div className="h-px bg-(--neutral-100) dark:bg-(--dark-border)" />
      <div className="flex justify-between">
        <div className="h-7 w-20 bg-(--neutral-100) dark:bg-(--dark-border) rounded-full" />
        <div className="h-7 w-16 bg-(--neutral-100) dark:bg-(--dark-border) rounded" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StarRating — display only (filled amber up to rating, outline after)
// ---------------------------------------------------------------------------
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={14}
          fill={i < rating ? "#f59e0b" : "none"}
          className={i < rating ? "text-amber-400" : "text-(--neutral-300)"}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InteractiveStarPicker — hover preview + click to set rating (drawer form)
// ---------------------------------------------------------------------------
function InteractiveStarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHovered(null)}
      role="group"
      aria-label="Star rating picker"
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(starValue)}
            onMouseEnter={() => setHovered(starValue)}
            aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--green-800) rounded"
          >
            <Star
              size={26}
              fill={i < display ? "#f59e0b" : "none"}
              className={`transition-colors ${
                i < display
                  ? "text-amber-400"
                  : "text-(--neutral-300) hover:text-amber-300"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceBadge — Facebook (blue) or Manual (gray)
// ---------------------------------------------------------------------------
function SourceBadge({ source }: { source: "facebook" | "manual" }) {
  const isFb = source === "facebook";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-dm font-semibold capitalize shrink-0"
      style={{
        fontSize: 11,
        backgroundColor: isFb ? "#e7f3fe" : "#f3f3f3",
        color: isFb ? "#1877f2" : "#6b7280",
      }}
    >
      {isFb && (
        <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>f</span>
      )}
      {source}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BeforeAfterImages — two thumbnails side by side; hidden if both absent
// ---------------------------------------------------------------------------
function BeforeAfterImages({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string | null;
  afterUrl: string | null;
}) {
  if (!beforeUrl && !afterUrl) return null;

  return (
    <div className="flex gap-2">
      {(["before", "after"] as const).map((label) => {
        const url = label === "before" ? beforeUrl : afterUrl;
        return (
          <div key={label} className="flex-1 flex flex-col gap-1">
            <span className="font-dm text-[10px] font-semibold text-(--neutral-400) uppercase tracking-wider">
              {label}
            </span>
            <div className="relative aspect-[4/3] rounded-[8px] overflow-hidden bg-(--neutral-100) dark:bg-(--dark-border)">
              {url ? (
                <Image
                  src={url}
                  alt={`${label} image`}
                  fill
                  className="object-cover"
                  sizes="160px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-dm text-[11px] text-(--neutral-400)">
                    No image
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageUploadZone — dashed upload area with XHR progress via CircularProgress
// ---------------------------------------------------------------------------
function ImageUploadZone({
  label,
  objectKey,
  previewUrl,
  onUpload,
  onClear,
}: {
  label: string;
  objectKey: string | null;
  previewUrl: string | null;
  onUpload: (key: string) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null); // null = idle

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setProgress(0);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", "testimonials");

      // Use XHR so we get upload progress events
      const result = await new Promise<{ objectKey: string; publicUrl: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener("progress", (ev) => {
            if (ev.lengthComputable) {
              // Cap at 90 until we get server response
              setProgress(Math.round((ev.loaded / ev.total) * 90));
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch {
                reject(new Error("Invalid response from upload endpoint"));
              }
            } else {
              try {
                const body = JSON.parse(xhr.responseText);
                reject(new Error(body.error ?? "Upload failed"));
              } catch {
                reject(new Error("Upload failed"));
              }
            }
          });

          xhr.addEventListener("error", () => reject(new Error("Network error")));
          xhr.open("POST", "/api/admin/upload?category=testimonials");
          xhr.send(form);
        }
      );

      setProgress(100);
      onUpload(result.objectKey);
      toast.success(`${label} image uploaded`);
    } catch (err) {
      console.error("[ImageUploadZone] upload error", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setTimeout(() => setProgress(null), 600);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const isUploading = progress !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      {/* Preview state — existing image with a clear button */}
      {objectKey && !isUploading ? (
        <div className="relative rounded-[8px] overflow-hidden border border-(--neutral-200) dark:border-(--dark-border)">
          <div className="relative aspect-[16/9]">
            <Image
              src={
                previewUrl ??
                `${(process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/${objectKey}`
              }
              alt={label}
              fill
              className="object-cover"
              sizes="280px"
            />
          </div>
          <button
            type="button"
            onClick={onClear}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-(--dark-surface)/90 flex items-center justify-center text-(--danger) shadow-sm hover:bg-white transition-colors"
            aria-label={`Remove ${label} image`}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        /* Upload zone */
        <button
          type="button"
          onClick={() => !isUploading && fileRef.current?.click()}
          disabled={isUploading}
          className="flex flex-col items-center justify-center gap-2 rounded-[8px] border-2 border-dashed border-(--neutral-200) dark:border-(--dark-border) hover:border-(--green-800) dark:hover:border-(--dark-accent) transition-colors py-5 disabled:cursor-not-allowed"
          aria-label={`Upload ${label} image`}
        >
          {isUploading ? (
            <CircularProgress percent={progress ?? 0} size={48} />
          ) : (
            <>
              <Upload size={20} className="text-(--neutral-400) dark:text-(--dark-muted)" />
              <span className="font-dm text-[12px] text-(--neutral-400) dark:text-(--dark-muted)">
                Click to upload
              </span>
              <span className="font-dm text-[10px] text-(--neutral-300)">
                JPG, PNG, WebP — max 5 MB
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TestimonialCard — full card in the responsive grid
// ---------------------------------------------------------------------------
function TestimonialCard({
  testimonial,
  isApprovePending,
  isSortPending,
  onApproveToggle,
  onSortChange,
  onDelete,
}: {
  testimonial: Testimonial;
  isApprovePending: boolean;
  isSortPending: boolean;
  onApproveToggle: (t: Testimonial) => void;
  onSortChange: (id: string, newOrder: number) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localOrder, setLocalOrder] = useState(testimonial.sortOrder);
  const [inputFocused, setInputFocused] = useState(false);

  function handleSortBlur() {
    setInputFocused(false);
    if (localOrder !== testimonial.sortOrder) {
      onSortChange(testimonial.id, localOrder);
    }
  }

  return (
    <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) p-5 flex flex-col gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-shadow">
      {/* ── Top: author + source ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-syne font-semibold text-(--neutral-900) dark:text-(--dark-text) text-[14px] leading-snug truncate">
            {testimonial.authorName}
          </p>
          {testimonial.location && (
            <p className="font-dm text-(--neutral-400) dark:text-(--dark-muted) text-[12px] truncate mt-[1px]">
              {testimonial.location}
            </p>
          )}
        </div>
        <SourceBadge source={testimonial.source} />
      </div>

      {/* ── Stars ── */}
      <StarRating rating={testimonial.rating} />

      {/* ── Quote (clamp-4, expandable) ── */}
      <div className="flex flex-col gap-1">
        <p
          className={`font-dm text-(--neutral-700) dark:text-(--dark-text) leading-[1.65] italic text-[13px] ${
            expanded ? "" : "line-clamp-4"
          }`}
        >
          &ldquo;{testimonial.quote}&rdquo;
        </p>
        {testimonial.quote.length > 160 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-dm text-[11px] font-semibold text-(--green-800) dark:text-(--dark-accent) hover:underline self-start"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      {/* ── Before / After images ── */}
      <BeforeAfterImages
        beforeUrl={testimonial.beforeUrl}
        afterUrl={testimonial.afterUrl}
      />

      {/* ── Footer: approve switch + sort + delete ── */}
      <div className="flex items-center justify-between gap-3 mt-auto pt-3 border-t border-(--neutral-100) dark:border-(--dark-border)">
        {/* Approve toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Switch
            checked={testimonial.approved}
            onChange={() => onApproveToggle(testimonial)}
            disabled={isApprovePending}
          />
          <span className="font-dm text-[12px] text-(--neutral-600) dark:text-(--dark-muted)">
            {testimonial.approved ? "Approved" : "Approve"}
          </span>
        </label>

        <div className="flex items-center gap-2">
          {/* Sort order */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={`sort-${testimonial.id}`}
              className="font-dm text-(--neutral-400) whitespace-nowrap"
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
                className="w-[52px] text-center rounded-[6px] font-dm font-semibold transition-colors disabled:opacity-60 bg-(--neutral-50) dark:bg-(--dark-bg) dark:text-(--dark-text)"
                style={{
                  fontSize: 12,
                  padding: "4px 6px",
                  border: inputFocused
                    ? "1px solid var(--green-800)"
                    : "1px solid var(--neutral-200)",
                  outline: "none",
                }}
              />
              {isSortPending && (
                <span className="absolute -right-5">
                  <span className="animate-spin inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full" />
                </span>
              )}
            </div>
          </div>

          {/* Delete */}
          <button
            type="button"
            onClick={() => onDelete(testimonial.id)}
            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-(--neutral-400) hover:text-(--danger) hover:bg-(--danger-bg) transition-colors"
            aria-label="Delete testimonial"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TestimonialDrawer — slide-in panel for adding a new testimonial
// ---------------------------------------------------------------------------
function TestimonialDrawer({
  open,
  onClose,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (form: DrawerForm) => void;
}) {
  const [form, setForm] = useState<DrawerForm>(blankForm());
  const [beforePreview, setBeforePreview] = useState<string | null>(null);
  const [afterPreview, setAfterPreview] = useState<string | null>(null);

  function patch(update: Partial<DrawerForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  function handleClose() {
    setForm(blankForm());
    setBeforePreview(null);
    setAfterPreview(null);
    onClose();
  }

  function handleSubmit() {
    if (!form.authorName.trim()) {
      toast.error("Author name is required");
      return;
    }
    if (!form.quote.trim()) {
      toast.error("Quote is required");
      return;
    }
    onSubmit(form);
  }

  function handleBeforeUpload(key: string) {
    patch({ beforeKey: key });
    const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
    setBeforePreview(base ? `${base}/${key}` : null);
  }

  function handleAfterUpload(key: string) {
    patch({ afterKey: key });
    const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
    setAfterPreview(base ? `${base}/${key}` : null);
  }

  const footer = (
    <>
      <button
        type="button"
        onClick={handleClose}
        disabled={isPending}
        className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors disabled:opacity-50 mr-auto"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="h-9 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
      >
        {isPending && (
          <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
        )}
        Add Testimonial
      </button>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Add Testimonial"
      width={480}
      footer={footer}
    >
      <div className="flex flex-col gap-6">
        {/* ── Author ── */}
        <section className="flex flex-col gap-4">
          <div>
            <label className={labelCls}>Author Name *</label>
            <input
              className={inputCls}
              placeholder="e.g. Jane Wanjiku"
              value={form.authorName}
              onChange={(e) => patch({ authorName: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <input
              className={inputCls}
              placeholder="e.g. Nairobi, Kenya"
              value={form.location}
              onChange={(e) => patch({ location: e.target.value })}
            />
          </div>
        </section>

        {/* ── Quote ── */}
        <section>
          <label className={labelCls}>Quote *</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={4}
            placeholder="The customer's testimonial in their own words…"
            value={form.quote}
            onChange={(e) => patch({ quote: e.target.value })}
          />
        </section>

        {/* ── Star rating ── */}
        <section>
          <label className={labelCls}>Star Rating</label>
          <InteractiveStarPicker
            value={form.rating}
            onChange={(v) => patch({ rating: v })}
          />
          <p className="font-dm text-[11px] text-(--neutral-400) mt-1.5">
            {form.rating} out of 5 stars
          </p>
        </section>

        {/* ── Before / After upload ── */}
        <section className="flex flex-col gap-4">
          <p className="font-syne text-[14px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">
            Before / After Images
          </p>
          <ImageUploadZone
            label="Before"
            objectKey={form.beforeKey}
            previewUrl={beforePreview}
            onUpload={handleBeforeUpload}
            onClear={() => {
              patch({ beforeKey: null });
              setBeforePreview(null);
            }}
          />
          <ImageUploadZone
            label="After"
            objectKey={form.afterKey}
            previewUrl={afterPreview}
            onUpload={handleAfterUpload}
            onClear={() => {
              patch({ afterKey: null });
              setAfterPreview(null);
            }}
          />
        </section>

        {/* ── Source ── */}
        <section>
          <label className={labelCls}>Source</label>
          <div className="flex gap-4">
            {(["manual", "facebook"] as const).map((src) => (
              <label
                key={src}
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <input
                  type="radio"
                  name="testimonial-source"
                  value={src}
                  checked={form.source === src}
                  onChange={() => patch({ source: src })}
                  className="accent-[var(--green-800)]"
                />
                <span className="font-dm text-[13px] text-(--neutral-700) dark:text-(--dark-text) capitalize">
                  {src}
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// AdminTestimonialsClient — main exported component
// ---------------------------------------------------------------------------
export function AdminTestimonialsClient() {
  const qc = useQueryClient();

  // In-flight ID tracking — one per mutation type to avoid global spinner
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);
  const [pendingSortId, setPendingSortId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Data fetch ──
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ["admin-testimonials"],
    queryFn: async () => {
      const res = await fetch("/api/admin/testimonials");
      if (!res.ok) throw new Error("Failed to fetch testimonials");
      return res.json();
    },
    staleTime: 30_000,
  });

  const testimonials = data?.data?.testimonials ?? [];
  const approvedCount = testimonials.filter((t) => t.approved).length;

  // ── Create (POST /api/admin/testimonials) ──
  const createMutation = useMutation({
    mutationFn: async (form: DrawerForm) => {
      const res = await fetch("/api/admin/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: form.authorName.trim(),
          location: form.location.trim() || undefined,
          quote: form.quote.trim(),
          rating: form.rating,
          beforeKey: form.beforeKey ?? undefined,
          afterKey: form.afterKey ?? undefined,
          source: form.source,
        }),
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Testimonial added");
        qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
        setDrawerOpen(false);
      } else {
        toast.error(result.error?.message ?? "Failed to add testimonial");
      }
    },
    onError: (err) => {
      console.error("[AdminTestimonialsClient] create error", err);
      toast.error("Failed to add testimonial");
    },
  });

  // ── Approve toggle (PATCH /api/admin/testimonials) ──
  const toggleApprove = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const res = await fetch("/api/admin/testimonials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approved }),
      });
      return res.json();
    },
    onMutate: ({ id }) => setPendingApproveId(id),
    onSuccess: (result, { approved }) => {
      if (result.ok) {
        toast.success(approved ? "Testimonial approved" : "Approval removed");
        qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      } else {
        toast.error("Failed to update approval");
      }
    },
    onError: (err) => {
      console.error("[AdminTestimonialsClient] approve error", err);
      toast.error("Failed to update approval");
    },
    onSettled: () => setPendingApproveId(null),
  });

  // ── Sort order (PATCH /api/admin/testimonials) ──
  const updateSort = useMutation({
    mutationFn: async ({ id, sortOrder }: { id: string; sortOrder: number }) => {
      const res = await fetch("/api/admin/testimonials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, sortOrder }),
      });
      return res.json();
    },
    onMutate: ({ id }) => setPendingSortId(id),
    onSuccess: (result) => {
      if (result.ok) {
        qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
      } else {
        toast.error("Failed to update sort order");
      }
    },
    onError: (err) => {
      console.error("[AdminTestimonialsClient] sort error", err);
      toast.error("Failed to update sort order");
    },
    onSettled: () => setPendingSortId(null),
  });

  // ── Delete (DELETE /api/admin/testimonials/[id]) ──
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/testimonials/${id}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Testimonial deleted");
        qc.invalidateQueries({ queryKey: ["admin-testimonials"] });
        setDeleteTarget(null);
      } else {
        toast.error("Failed to delete testimonial");
      }
    },
    onError: (err) => {
      console.error("[AdminTestimonialsClient] delete error", err);
      toast.error("Failed to delete testimonial");
    },
  });

  // ── Stable handlers (avoid re-renders on every card) ──
  const handleApproveToggle = useCallback(
    (t: Testimonial) => toggleApprove.mutate({ id: t.id, approved: !t.approved }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleApprove.mutate]
  );

  const handleSortChange = useCallback(
    (id: string, newOrder: number) => updateSort.mutate({ id, sortOrder: newOrder }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateSort.mutate]
  );

  // ── Render ──
  return (
    <div className="min-h-screen bg-(--neutral-50) dark:bg-(--dark-bg)">
      {/* ── Page header ── */}
      <div className="px-6 py-5 bg-white dark:bg-(--dark-surface) border-b border-(--neutral-200) dark:border-(--dark-border) flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <h1 className="font-syne font-semibold text-(--neutral-900) dark:text-(--dark-text) text-[22px] leading-tight">
            Testimonials
          </h1>
          {!isLoading && (
            <span className="bg-(--green-50) text-(--success) font-dm font-semibold text-[12px] px-2.5 py-0.5 rounded-full">
              {testimonials.length}
            </span>
          )}
        </div>

        {!isLoading && testimonials.length > 0 && (
          <span className="font-dm text-(--neutral-500) dark:text-(--dark-muted) text-[13px]">
            Approved:{" "}
            <span className="font-semibold text-(--success)">{approvedCount}</span>
          </span>
        )}

        <div className="ml-auto">
          <button
            onClick={() => setDrawerOpen(true)}
            className="h-9 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[13px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Plus size={15} />
            Add Testimonial
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-6 max-w-[1400px] mx-auto">
        {/* Error */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border)">
            <AlertCircle size={48} className="text-(--danger) mb-3" />
            <p className="font-syne font-semibold text-(--neutral-900) dark:text-(--dark-text) text-[16px] mb-1">
              Could not load testimonials
            </p>
            <p className="font-dm text-(--neutral-500) dark:text-(--dark-muted) text-[14px]">
              Please refresh the page and try again.
            </p>
          </div>
        )}

        {/* Grid */}
        {!isError && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

            {!isLoading && testimonials.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-24 text-center bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border)">
                <MessageSquare size={48} className="text-(--neutral-300) dark:text-(--dark-muted) mb-3" />
                <p className="font-syne font-semibold text-(--neutral-900) dark:text-(--dark-text) text-[16px] mb-1">
                  No testimonials yet
                </p>
                <p className="font-dm text-(--neutral-500) dark:text-(--dark-muted) text-[14px] mb-4">
                  Add your first testimonial to get started.
                </p>
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="h-9 px-4 rounded-[8px] bg-(--green-800) text-white font-dm text-[13px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <Plus size={14} />
                  Add Testimonial
                </button>
              </div>
            )}

            {!isLoading &&
              testimonials.map((t) => (
                <TestimonialCard
                  key={t.id}
                  testimonial={t}
                  isApprovePending={pendingApproveId === t.id}
                  isSortPending={pendingSortId === t.id}
                  onApproveToggle={handleApproveToggle}
                  onSortChange={handleSortChange}
                  onDelete={(id) => setDeleteTarget(id)}
                />
              ))}
          </div>
        )}

        {!isLoading && !isError && testimonials.length > 0 && (
          <p className="font-dm text-(--neutral-400) dark:text-(--dark-muted) text-[13px] mt-6 text-right">
            {testimonials.length} testimonial{testimonials.length !== 1 ? "s" : ""} total
          </p>
        )}
      </div>

      {/* ── Add drawer ── */}
      <TestimonialDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isPending={createMutation.isPending}
        onSubmit={(form) => createMutation.mutate(form)}
      />

      {/* ── Delete confirm modal ── */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="Delete testimonial?"
        description="This will permanently remove the testimonial. This action cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
