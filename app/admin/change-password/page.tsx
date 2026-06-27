"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";

// Standalone page — shown after login when mustChangePassword is true.
// No sidebar/header since the admin hasn't reached the dashboard yet.
export default function AdminChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Failed");
      toast.success("Password updated. Welcome!");
      router.push("/admin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-(--neutral-50) px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex flex-col items-center gap-3 mb-8">
          <Image src="/logo/Asset 16@5x.webp" alt="Fechi Organics" width={48} height={48} className="rounded" />
          <h1 className="font-syne text-[22px] font-bold text-(--neutral-900)">Set your password</h1>
          <p className="font-dm text-[14px] text-(--neutral-500) text-center">
            You must set a new password before continuing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">New Password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-(--neutral-200) font-dm text-[14px] text-black/70 outline-none focus:border-(--green-500)"
              placeholder="Min 8 characters"
              required
            />
          </div>
          <div>
            <label className="font-dm text-[13px] font-medium text-(--neutral-700) block mb-1">Confirm Password</label>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-(--neutral-200) font-dm text-[14px] text-black/70 outline-none focus:border-(--green-500)"
              placeholder="Repeat password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-(--green-800) text-white font-dm text-[14px] font-semibold hover:bg-(--green-900) disabled:opacity-60 transition-colors"
          >
            {loading ? "Saving…" : "Set Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
