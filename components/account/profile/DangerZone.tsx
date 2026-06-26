"use client"

import { useState, useTransition } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"
import { deleteAccount } from "@/lib/account/actions"

export default function DangerZone({ userName }: { userName: string }) {
  const [confirming, setConfirming] = useState(false)
  const [input, setInput] = useState("")
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteAccount()
      } catch {
        toast.error("Failed to delete account. Please try again.")
      }
    })
  }

  return (
    <div className="mt-8 rounded-2xl border border-red-100 bg-red-50/30 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-red-500 mb-3">
        Danger Zone
      </p>
      <h3 className="text-2xl font-bold text-red-500 mb-1">Delete Account</h3>
      <p className="text-sm text-red-400 mb-4">
        This permanently deletes {userName}&apos;s account and all associated data.
        This action cannot be undone.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          <Icon icon="lucide:trash-2" width={15} />
          Delete Account
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-red-500 font-medium">
            Type your name <span className="font-bold">{userName}</span> to confirm:
          </p>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={userName}
            className="w-full max-w-xs px-3.5 py-2.5 border border-red-300 rounded-md text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setConfirming(false); setInput("") }}
              className="text-sm font-medium text-neutral-600 hover:text-neutral-800 px-4 py-2.5 rounded-lg border border-neutral-300 hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={input !== userName || pending}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              {pending && <Icon icon="lucide:loader-2" width={14} className="animate-spin" />}
              Permanently Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
