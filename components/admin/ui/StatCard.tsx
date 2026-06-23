import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

interface StatCardProps {
  eyebrow: string;
  value: string;
  trend?: { value: string; positive: boolean };
  icon?: LucideIcon;
}

export function StatCard({ eyebrow, value, trend, icon: Icon }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) border-l-4 border-l-(--green-500) dark:border-l-(--dark-accent) shadow-(--e1) p-6 relative">
      {Icon && (
        <div className="absolute top-5 right-5 w-10 h-10 rounded-[10px] bg-(--green-50) dark:bg-(--dark-border) flex items-center justify-center">
          <Icon size={20} className="text-(--green-600) dark:text-(--dark-accent)" />
        </div>
      )}
      <div className="font-dm text-[11px] font-semibold uppercase tracking-widest text-(--neutral-500) dark:text-(--dark-muted) mb-3">
        {eyebrow}
      </div>
      <div className="font-syne text-[28px] font-bold text-(--neutral-900) dark:text-(--dark-text) leading-none mb-2">
        {value}
      </div>
      {trend && (
        <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-dm text-[11px] font-medium ${
          trend.positive ? "bg-(--green-100) text-(--green-700)" : "bg-(--danger-bg) text-(--danger)"
        }`}>
          {trend.positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {trend.value}
        </div>
      )}
    </div>
  );
}
