"use client";

import { Icon } from "@iconify/react";
import { toast } from "@/lib/toast";

export function CopyLinkButton({ path, label = "Copy Link" }: { path: string; label?: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(`${window.location.origin}${path}`);
        toast.success("Link copied");
      }}
      className="h-9 px-3 rounded-[8px] border border-(--neutral-200) font-dm text-[12px] text-(--neutral-700) hover:bg-(--neutral-50) flex items-center gap-1.5 transition-colors"
    >
      <Icon icon="lucide:link-2" width={13} /> {label}
    </button>
  );
}
