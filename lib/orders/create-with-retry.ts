// ---------------------------------------------------------------------------
// Retries an order/inStoreOrder create() specifically when it collides on the
// orderNumber unique constraint (both generate-order-number.ts and
// generate-instore-order-number.ts are only unique to the second, by design
// — see their own comments). Never touches the order-number FORMAT itself:
// several downstream consumers slice it into a Daraja/KCB AccountReference
// with a very tight character budget (Daraja rejects over 12 chars), so
// adding entropy there is unsafe without re-verifying that math everywhere.
// Regenerating and waiting for the next second boundary sidesteps that
// entirely — it only ever costs the rare colliding request ~1s, never the
// happy path.
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;

function isOrderNumberCollision(e: unknown): boolean {
  if (typeof e !== "object" || e === null || !("code" in e)) return false;
  if ((e as { code?: string }).code !== "P2002") return false;
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.includes("orderNumber");
  return typeof target === "string" && target.includes("orderNumber");
}

function waitForNextSecond(): Promise<void> {
  const msLeft = 1000 - (Date.now() % 1000);
  return new Promise((resolve) => setTimeout(resolve, msLeft + 20));
}

export async function createWithRetryableOrderNumber<T>(
  generateOrderNumber: () => string,
  attempt: (orderNumber: string) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      return await attempt(generateOrderNumber());
    } catch (e) {
      if (!isOrderNumberCollision(e) || i === MAX_ATTEMPTS - 1) throw e;
      console.warn(`[create-with-retry] orderNumber collision, attempt ${i + 1}/${MAX_ATTEMPTS} — retrying`);
      await waitForNextSecond();
    }
  }
  // Unreachable — the loop above always returns or throws.
  throw new Error("createWithRetryableOrderNumber: exhausted attempts");
}
