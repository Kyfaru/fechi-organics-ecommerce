"use client";

import { useEffect, useRef } from "react";
import { collectDeviceSignals } from "@/lib/points/fingerprint";

/**
 * Reports this browser's device signals once per session, for anti-farming
 * scoring at first payment (lib/points/anti-abuse.ts).
 *
 * Mounted on the account layout and the checkout flow. Entirely best-effort:
 * a failure here must never surface to the customer or block anything, and a
 * blocked/erroring request just means one weaker signal is missing when the
 * score is computed.
 */
export function useDeviceSignal(enabled = true) {
  const sent = useRef(false);

  useEffect(() => {
    if (!enabled || sent.current) return;
    sent.current = true;

    // sessionStorage, not localStorage — re-reporting once per session keeps
    // lastSeenAt fresh without a request on every page view.
    try {
      if (window.sessionStorage.getItem("fechi_device_sent") === "1") return;
    } catch {
      /* private mode — just send it */
    }

    const { fingerprint, deviceId } = collectDeviceSignals();
    if (!fingerprint && !deviceId) return;

    fetch("/api/points/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fingerprint, deviceId }),
    })
      .then(() => {
        try {
          window.sessionStorage.setItem("fechi_device_sent", "1");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* best-effort — never surfaced to the customer */
      });
  }, [enabled]);
}
