import { toast } from "@/lib/toast";

/**
 * Fetch wrapper for admin API calls — surfaces a 403 with the same critical
 * toast used for payment-failed/other critical alerts (see
 * components/admin/NotificationBell.tsx → lib/toast.ts's toast.critical),
 * and a 202 ("queued for admin approval" — see lib/require-approval.ts) with
 * a distinct info toast instead of a generic error or a false success.
 *
 * Returns the parsed { ok, data } envelope's `data` on success, or null when
 * the request was denied/queued (callers branch on the return value instead
 * of throwing, since both are legitimate non-error outcomes to handle).
 */
export async function adminFetch<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ status: "ok"; data: T } | { status: "denied" } | { status: "queued"; requestId: string }> {
  const res = await fetch(url, init);
  let json: { ok?: boolean; data?: unknown; error?: { message?: string } } | null = null;
  try {
    json = await res.json();
  } catch {
    toast.error("Something went wrong", { message: `${url} → HTTP ${res.status} (non-JSON response)` });
    throw new Error(`${url} → HTTP ${res.status} (non-JSON response)`);
  }

  if (res.status === 403) {
    toast.critical("Access Denied", {
      message: json?.error?.message ?? "You don't have permission to do this.",
    });
    return { status: "denied" };
  }

  if (res.status === 202) {
    const data = json?.data as { queued?: boolean; requestId?: string } | undefined;
    toast.info("Submitted for admin approval", {
      message: "This action needs admin sign-off before it takes effect. You'll be notified once it's decided.",
    });
    return { status: "queued", requestId: data?.requestId ?? "" };
  }

  if (!res.ok || !json?.ok) {
    const message = json?.error?.message ?? `${url} → HTTP ${res.status}`;
    toast.error("Something went wrong", { message });
    throw new Error(message);
  }

  return { status: "ok", data: json.data as T };
}
