import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[240px] py-8 text-center bg-(--green-50) dark:bg-(--dark-bg)">
      <Icon size={64} className="text-(--green-500) dark:text-(--dark-accent) mb-4" />
      <h3 className="font-syne text-[18px] font-semibold text-(--neutral-700) dark:text-(--dark-text) mb-2">{title}</h3>
      <p className="font-dm text-[14px] text-(--neutral-500) dark:text-(--dark-muted) max-w-[320px] mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="h-10 px-5 rounded-[8px] bg-(--green-800) text-white font-dm text-[14px] font-medium hover:bg-(--green-900) transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
