"use client"

import { Icon } from "@iconify/react"

export default function PageHeader({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: string
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon icon={icon} width={16} className="text-[#15803D]" />
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          {eyebrow}
        </span>
      </div>
      <h1 className="text-3xl font-bold text-neutral-900">{title}</h1>
      {description && <p className="text-base text-neutral-500 mt-1.5">{description}</p>}
    </div>
  )
}
