const STATUS_MAP: Record<string, { text: string; bg: string; dot: string }> = {
  active:       { text: "text-[--success]",     bg: "bg-[--green-50]",    dot: "bg-[--success]" },
  paid:         { text: "text-[--success]",     bg: "bg-[--green-50]",    dot: "bg-[--success]" },
  delivered:    { text: "text-[--success]",     bg: "bg-[--green-50]",    dot: "bg-[--success]" },
  in_stock:     { text: "text-[--success]",     bg: "bg-[--green-50]",    dot: "bg-[--success]" },
  published:    { text: "text-[--success]",     bg: "bg-[--green-50]",    dot: "bg-[--success]" },
  open:         { text: "text-[--success]",     bg: "bg-[--green-50]",    dot: "bg-[--success]" },
  confirmed:    { text: "text-[--success]",     bg: "bg-[--green-50]",    dot: "bg-[--success]" },
  received:     { text: "text-[--success]",     bg: "bg-[--green-50]",    dot: "bg-[--success]" },
  pending:      { text: "text-[--gold-700]",    bg: "bg-[--gold-100]",    dot: "bg-[--gold-700]" },
  processing:   { text: "text-[--gold-700]",    bg: "bg-[--gold-100]",    dot: "bg-[--gold-700]" },
  low_stock:    { text: "text-[--gold-700]",    bg: "bg-[--gold-100]",    dot: "bg-[--gold-700]" },
  scheduled:    { text: "text-[--gold-700]",    bg: "bg-[--gold-100]",    dot: "bg-[--gold-700]" },
  sending:      { text: "text-[--gold-700]",    bg: "bg-[--gold-100]",    dot: "bg-[--gold-700]" },
  shipped:      { text: "text-[--gold-700]",    bg: "bg-[--gold-100]",    dot: "bg-[--gold-700]" },
  sent:         { text: "text-[--gold-700]",    bg: "bg-[--gold-100]",    dot: "bg-[--gold-700]" },
  failed:       { text: "text-[--danger]",      bg: "bg-[--danger-bg]",   dot: "bg-[--danger]" },
  cancelled:    { text: "text-[--danger]",      bg: "bg-[--danger-bg]",   dot: "bg-[--danger]" },
  out_of_stock: { text: "text-[--danger]",      bg: "bg-[--danger-bg]",   dot: "bg-[--danger]" },
  expired:      { text: "text-[--danger]",      bg: "bg-[--danger-bg]",   dot: "bg-[--danger]" },
  draft:        { text: "text-[--neutral-500]", bg: "bg-[--neutral-100]", dot: "bg-[--neutral-400]" },
  archived:     { text: "text-[--neutral-500]", bg: "bg-[--neutral-100]", dot: "bg-[--neutral-400]" },
  resolved:     { text: "text-[--neutral-500]", bg: "bg-[--neutral-100]", dot: "bg-[--neutral-400]" },
};

export function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  const s = STATUS_MAP[key] ?? { text: "text-[--neutral-500]", bg: "bg-[--neutral-100]", dot: "bg-[--neutral-400]" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-[10px] h-6 font-dm text-[12px] font-medium ${s.text} ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, " ")}
    </span>
  );
}
