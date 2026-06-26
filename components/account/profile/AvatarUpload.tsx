"use client"

import { useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function AvatarUpload({
  currentUrl,
  name,
  onUploaded,
}: {
  currentUrl: string | null
  name: string
  onUploaded: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File exceeds 15 MB")
      return
    }

    setUploading(true)
    setPreview(URL.createObjectURL(file))

    const fd = new FormData()
    fd.append("file", file)

    const res = await fetch("/api/account/profile/avatar", { method: "POST", body: fd })
    const json = await res.json()

    if (!res.ok) {
      toast.error(json.error ?? "Upload failed")
      setPreview(currentUrl)
    } else {
      toast.success("Avatar updated")
      onUploaded(json.url)
    }
    setUploading(false)
  }

  return (
    <div className="flex items-center gap-5">
      {/* Avatar with hover overlay */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-20 h-20 rounded-full overflow-hidden group shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15803D]"
        aria-label="Change avatar"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#15803D] flex items-center justify-center">
            <span className="text-white text-xl font-semibold">{getInitials(name)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-[#14532D]/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? (
            <Icon icon="lucide:loader-2" className="text-white w-6 h-6 animate-spin" />
          ) : (
            <Icon icon="lucide:camera" className="text-white w-6 h-6" />
          )}
        </div>
      </button>

      <div>
        <p className="text-sm font-medium text-neutral-900">{name}</p>
        <p className="text-xs text-neutral-500 mt-0.5">Hover to edit · Max 15 MB</p>
        <p className="text-xs text-neutral-400">JPG, PNG, WEBP, GIF, AVIF, BMP</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}
