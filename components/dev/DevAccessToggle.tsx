"use client";

import { useState } from "react";

export function DevAccessToggle({ secretKey, initialEnabled }: { secretKey: string; initialEnabled: boolean }) {
  const [on, setOn] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: secretKey, on: !on }),
      });
      if (res.ok) setOn((v) => !v);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-center font-sans">
      <p className="mb-4 text-sm text-neutral-600">
        Developer admin access: <strong>{on ? "ON" : "OFF"}</strong>
      </p>
      <button
        onClick={toggle}
        disabled={loading}
        className={`px-6 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
          on ? "bg-red-600 hover:bg-red-700" : "bg-green-700 hover:bg-green-800"
        }`}
      >
        {loading ? "…" : on ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
