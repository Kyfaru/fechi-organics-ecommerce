const STATUS_MAP: Record<string, { text: string; bg: string; dot: string }> = {
  active:       { text: "text-(--green-900) dark:text-(--dark-text)", bg: "bg-(--green-100) dark:bg-(--dark-border)", dot: "bg-(--success)" },
  paid:         { text: "text-(--green-900) dark:text-(--dark-text)", bg: "bg-(--green-100) dark:bg-(--dark-border)", dot: "bg-(--success)" },
  delivered:    { text: "text-(--green-900) dark:text-(--dark-text)", bg: "bg-(--green-100) dark:bg-(--dark-border)", dot: "bg-(--success)" },
  in_stock:     { text: "text-(--green-900) dark:text-(--dark-text)", bg: "bg-(--green-100) dark:bg-(--dark-border)", dot: "bg-(--success)" },
  published:    { text: "text-(--green-900) dark:text-(--dark-text)", bg: "bg-(--green-100) dark:bg-(--dark-border)", dot: "bg-(--success)" },
  open:         { text: "text-(--green-900) dark:text-(--dark-text)", bg: "bg-(--green-100) dark:bg-(--dark-border)", dot: "bg-(--success)" },
  confirmed:    { text: "text-(--green-900) dark:text-(--dark-text)", bg: "bg-(--green-100) dark:bg-(--dark-border)", dot: "bg-(--success)" },
  received:     { text: "text-(--green-900) dark:text-(--dark-text)", bg: "bg-(--green-100) dark:bg-(--dark-border)", dot: "bg-(--success)" },
  pending:      { text: "text-(--gold-700) dark:text-(--dark-accent)", bg: "bg-(--gold-100) dark:bg-(--orange-700)", dot: "bg-(--gold-700) dark:bg-(--dark-accent)" },
  processing:   { text: "text-(--gold-700) dark:text-(--dark-accent)", bg: "bg-(--gold-100) dark:bg-(--orange-700)", dot: "bg-(--gold-700) dark:bg-(--dark-accent)" },
  low_stock:    { text: "text-(--gold-700) dark:text-(--dark-accent)", bg: "bg-(--gold-100) dark:bg-(--orange-700)", dot: "bg-(--gold-700) dark:bg-(--dark-accent)" },
  scheduled:    { text: "text-(--gold-700) dark:text-(--dark-accent)", bg: "bg-(--gold-100) dark:bg-(--orange-700)", dot: "bg-(--gold-700) dark:bg-(--dark-accent)" },
  sending:      { text: "text-(--gold-700) dark:text-(--dark-accent)", bg: "bg-(--gold-100) dark:bg-(--orange-700)", dot: "bg-(--gold-700) dark:bg-(--dark-accent)" },
  shipped:      { text: "text-(--gold-700) dark:text-(--dark-accent)", bg: "bg-(--gold-100) dark:bg-(--orange-700)", dot: "bg-(--gold-700) dark:bg-(--dark-accent)" },
  sent:         { text: "text-(--gold-700) dark:text-(--dark-accent)", bg: "bg-(--gold-100) dark:bg-(--orange-700)", dot: "bg-(--gold-700) dark:bg-(--dark-accent)" },
  failed:       { text: "text-(--danger)", bg: "bg-(--danger-bg) dark:bg-red-950/40", dot: "bg-(--danger)" },
  cancelled:    { text: "text-(--danger)", bg: "bg-(--danger-bg) dark:bg-red-950/40", dot: "bg-(--danger)" },
  out_of_stock: { text: "text-(--danger)", bg: "bg-(--danger-bg) dark:bg-red-950/40", dot: "bg-(--danger)" },
  expired:      { text: "text-(--danger)", bg: "bg-(--danger-bg) dark:bg-red-950/40", dot: "bg-(--danger)" },
  draft:        { text: "text-(--green-700) dark:text-(--dark-muted)", bg: "bg-(--neutral-100) dark:bg-(--dark-border)", dot: "bg-(--neutral-400)" },
  archived:     { text: "text-(--green-700) dark:text-(--dark-muted)", bg: "bg-(--neutral-100) dark:bg-(--dark-border)", dot: "bg-(--neutral-400)" },
  resolved:     { text: "text-(--green-700) dark:text-(--dark-muted)", bg: "bg-(--neutral-100) dark:bg-(--dark-border)", dot: "bg-(--neutral-400)" },
};

export function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  const s = STATUS_MAP[key] ?? { text: "text-(--green-700) dark:text-(--dark-muted)", bg: "bg-(--neutral-100) dark:bg-(--dark-border)", dot: "bg-(--neutral-400)" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-[10px] h-6 font-dm text-[12px] font-medium ${s.text} ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, " ")}
    </span>
  );
}
