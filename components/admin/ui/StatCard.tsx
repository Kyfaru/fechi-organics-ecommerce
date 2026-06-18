import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  eyebrow: string;
  value: string;
  trend?: { value: string; positive: boolean };
  icon?: LucideIcon;
}

export function StatCard({ eyebrow, value, trend, icon: Icon }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6 relative">
      {Icon && (
        <div className="absolute top-5 right-5">
          <Icon size={20} className="text-[--neutral-300]" />
        </div>
      )}
      <div className="font-dm text-[12px] font-medium uppercase tracking-[0.06em] text-[--neutral-500] dark:text-[--dark-muted] mb-3">
        {eyebrow}
      </div>
      <div className="font-syne text-[32px] font-bold text-[--neutral-900] dark:text-[--dark-text] leading-none mb-2">
        {value}
      </div>
      {trend && (
        <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-dm text-[12px] font-medium ${
          trend.positive ? "bg-[--green-50] text-[--success]" : "bg-[--danger-bg] text-[--danger]"
        }`}>
          {trend.positive ? "↑" : "↓"} {trend.value}
        </div>
      )}
    </div>
  );
}
