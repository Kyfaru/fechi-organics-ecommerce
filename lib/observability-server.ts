import "server-only";
import { getPostHogServer } from "@/lib/posthog-server";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { extractErrorCode, categorizeErrorLog, interpretErrorLog } from "@/lib/error-log-interpreter";

/**
 * Server-side PostHog capture (webhooks, workers, anything not running in the
 * browser). Kept out of lib/observability.ts because posthog-node pulls in
 * node:fs, which breaks Turbopack's client bundle if a client component ever
 * imports it transitively.
 */
export function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  getPostHogServer().capture({ distinctId, event, properties });
}

interface ServerErrorContext {
  route?: string;
  userId?: string;
  orderId?: string;
}

/**
 * Persists an `errorLog` row + fires a SYSTEM_ALERT notification, for the
 * plain-language admin error log (app/admin/(protected)/error-logs). Kept
 * alongside trackServerEvent for the same reason — `db` pulls in the Postgres
 * driver, which can't be reachable from lib/observability.ts (imported by
 * client components like LoginForm). Call this from route handlers alongside
 * (not instead of) reportError(), which still owns Sentry reporting.
 *
 * Best-effort: a DB or notification failure here must never break the
 * caller's actual error handling.
 */
export async function logServerError(error: unknown, context: ServerErrorContext = {}) {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const code = extractErrorCode(error);
    const category = categorizeErrorLog(code, message);

    const errorLog = await db.errorLog.create({
      data: {
        code,
        category,
        message,
        route: context.route ?? null,
        userId: context.userId ?? null,
        orderId: context.orderId ?? null,
      },
    });

    await createNotification({
      type: "SYSTEM_ALERT",
      title: interpretErrorLog({ code, category, message }),
      body: context.route ? `${context.route}: ${message}` : message,
      link: `/admin/error-logs?highlight=${errorLog.id}`,
    });
  } catch (e) {
    console.error("[logServerError] Failed to persist error log:", e);
  }
}
