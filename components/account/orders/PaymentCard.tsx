import { Icon } from "@iconify/react"

interface Transaction {
  id: string
  provider: string
  amount: number
  status: string
  mpesaReceiptNumber?: string | null
  failureReason?: string | null
  createdAt: string | Date
}

// Raw M-Pesa/provider failure strings vary in exact wording, so this matches
// on the common substring rather than an exact string, falling back to the
// stripped raw reason for anything unmapped.
const FAILURE_REASON_PATTERNS: [RegExp, string][] = [
  [/cancelled by user/i, "You cancelled the payment request"],
  [/insufficient/i, "Insufficient funds — try a different payment method"],
  [/timeout/i, "The payment request timed out — please try again"],
  [/invalid.*(pin|account)/i, "Incorrect PIN or account details — please try again"],
  [/unable to lock|cannot be reached/i, "We couldn't reach your phone — please try again"],
]

function humanizeFailureReason(raw: string): string {
  const stripped = raw.replace(/^\d+:\s*/, "").trim()
  return FAILURE_REASON_PATTERNS.find(([re]) => re.test(stripped))?.[1] ?? stripped
}

export default function PaymentCard({
  transactions,
  totalKes,
  subtotalKes,
  deliveryKes,
  discountKes,
}: {
  transactions: Transaction[]
  totalKes: number
  subtotalKes: number
  deliveryKes: number
  discountKes: number
}) {
  const paid = transactions.find((t) => t.status === "SUCCESS")
  const latest = transactions[0]
  const failed = !paid && latest?.status === "FAILED" ? latest : null

  function fmt(n: number) {
    return (n / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:credit-card" width={15} className="text-[#15803D]" />
        <h3 className="text-[13px] font-semibold text-neutral-700 uppercase tracking-wide">Payment</h3>
      </div>

      <div className="space-y-2 text-[13px]">
        <div className="flex justify-between text-neutral-500">
          <span>Subtotal</span>
          <span>KES {fmt(subtotalKes)}</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>Delivery</span>
          <span>KES {fmt(deliveryKes)}</span>
        </div>
        {discountKes > 0 && (
          <div className="flex justify-between text-[#15803D]">
            <span>Discount</span>
            <span>- KES {fmt(discountKes)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-neutral-900 pt-2 border-t border-neutral-100">
          <span>Total</span>
          <span>KES {fmt(totalKes)}</span>
        </div>
      </div>

      {paid && (
        <div className="pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-2 text-[12px] text-[#15803D]">
            <Icon icon="lucide:check-circle" width={13} />
            <span className="font-medium">Paid via {paid.provider}</span>
          </div>
          {paid.mpesaReceiptNumber && (
            <p className="text-[11px] text-neutral-400 mt-1">
              Receipt: {paid.mpesaReceiptNumber}
            </p>
          )}
        </div>
      )}

      {failed && (
        <div className="pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-2 text-[12px] text-red-600">
            <Icon icon="lucide:x-circle" width={13} />
            <span className="font-medium">Payment failed</span>
          </div>
          <p className="text-[12px] text-neutral-600 mt-1">
            {failed.failureReason ? humanizeFailureReason(failed.failureReason) : "No failure reason on file."}
          </p>
          <p className="text-[11px] text-neutral-400 mt-1">If this keeps happening, contact support.</p>
        </div>
      )}
    </div>
  )
}
