"use client"

import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

interface ReviewFormProps {
  orderId: string
}

function PhotoUpload({
  label,
  file,
  preview,
  onChange,
}: {
  label: string
  file: File | null
  preview: string | null
  onChange: (f: File | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <p className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1.5">{label}</p>
      {preview ? (
        <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
            aria-label="Remove photo"
          >
            <Icon icon="lucide:x" width={11} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="w-28 h-28 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 flex flex-col items-center justify-center gap-1.5 text-neutral-400 hover:border-[#15803D] hover:text-[#15803D] transition-colors"
        >
          <Icon icon="lucide:image-plus" width={22} />
          <span className="text-[11px] font-medium">Add photo</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          onChange(f)
          e.target.value = ""
        }}
      />
    </div>
  )
}

export function ReviewForm({ orderId }: ReviewFormProps) {
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [title, setTitle] = useState("")
  const [quote, setQuote] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [beforeFile, setBeforeFile] = useState<File | null>(null)
  const [beforePreview, setBeforePreview] = useState<string | null>(null)
  const [afterFile, setAfterFile] = useState<File | null>(null)
  const [afterPreview, setAfterPreview] = useState<string | null>(null)

  function handlePhoto(
    setFile: (f: File | null) => void,
    setPreview: (s: string | null) => void,
  ) {
    return (f: File | null) => {
      setFile(f)
      if (f) {
        const reader = new FileReader()
        reader.onload = (e) => setPreview(e.target?.result as string)
        reader.readAsDataURL(f)
      } else {
        setPreview(null)
      }
    }
  }

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      // Upload photos if present (base64 data URLs sent as-is; server stores inline or to Blob)
      const body: Record<string, unknown> = {
        orderId, rating, quote,
        title: title.trim() || undefined,
        isPublic,
        beforeDataUrl: beforePreview ?? undefined,
        afterDataUrl: afterPreview ?? undefined,
      }
      const res = await fetch("/api/account/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message ?? "Failed to submit review")
      return data
    },
    onSuccess: () => {
      toast.success("Review submitted — thank you! It will appear once approved.")
      router.push("/account/reviews")
      router.refresh()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const displayRating = hovered || rating

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-6">
      {/* Star rating */}
      <div>
        <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
          Your Rating <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="focus:outline-none"
              aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
            >
              <svg
                className={`w-9 h-9 transition-colors ${
                  star <= displayRating ? "text-amber-400" : "text-neutral-200 dark:text-neutral-700"
                }`}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.601a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </button>
          ))}
        </div>
        {displayRating > 0 && (
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1.5">
            {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][displayRating]}
          </p>
        )}
      </div>

      {/* Before / After photos (optional) */}
      <div>
        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
          Before &amp; After Photos <span className="text-neutral-400 font-normal">(optional)</span>
        </p>
        <div className="flex gap-4 flex-wrap">
          <PhotoUpload
            label="Before"
            file={beforeFile}
            preview={beforePreview}
            onChange={handlePhoto(setBeforeFile, setBeforePreview)}
          />
          <PhotoUpload
            label="After"
            file={afterFile}
            preview={afterPreview}
            onChange={handlePhoto(setAfterFile, setAfterPreview)}
          />
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
          Review Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Summarize your experience"
          maxLength={120}
          className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#15803D]/30 focus:border-[#15803D] transition"
        />
      </div>

      {/* Review body */}
      <div>
        <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
          Your Review <span className="text-red-500">*</span>
        </label>
        <textarea
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="Tell us about your experience with this order..."
          rows={4}
          maxLength={1000}
          className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#15803D]/30 focus:border-[#15803D] transition resize-none"
        />
        <p className="text-right text-[12px] text-neutral-400 mt-1">{quote.length}/1000</p>
      </div>

      {/* Public terms checkbox */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-[#15803D] focus:ring-[#15803D] accent-[#15803D]"
        />
        <span className="text-[13px] text-neutral-600 dark:text-neutral-400 leading-snug group-hover:text-neutral-900 dark:group-hover:text-neutral-200 transition-colors">
          I agree that this review may be made public on the Fechi Organics website and used in marketing materials.
        </span>
      </label>

      {/* Submit */}
      <button
        type="button"
        onClick={() => {
          if (rating === 0) { toast.error("Please select a rating"); return }
          if (!quote.trim()) { toast.error("Please write a review"); return }
          mutate()
        }}
        disabled={isPending}
        className="w-full py-3 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
      >
        {isPending && <Icon icon="lucide:loader-2" width={15} className="animate-spin" />}
        {isPending ? "Submitting..." : "Send Review"}
      </button>
    </div>
  )
}
