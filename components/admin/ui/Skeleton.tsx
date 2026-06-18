export function SkeletonStatCard() {
  return (
    <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6 animate-pulse">
      <div className="h-3 w-24 bg-[--neutral-100] dark:bg-[--dark-border] rounded mb-4" />
      <div className="h-8 w-32 bg-[--neutral-100] dark:bg-[--dark-border] rounded mb-3" />
      <div className="h-4 w-16 bg-[--neutral-100] dark:bg-[--dark-border] rounded" />
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[--neutral-200] dark:border-[--dark-border] animate-pulse">
      <div className="w-8 h-8 rounded-full bg-[--neutral-100] dark:bg-[--dark-border] shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-48 bg-[--neutral-100] dark:bg-[--dark-border] rounded" />
        <div className="h-2.5 w-32 bg-[--neutral-100] dark:bg-[--dark-border] rounded" />
      </div>
      <div className="h-6 w-20 bg-[--neutral-100] dark:bg-[--dark-border] rounded-full" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-white dark:bg-[--dark-surface] rounded-[12px] border border-[--neutral-200] dark:border-[--dark-border] shadow-[--e1] p-6 animate-pulse">
      <div className="h-4 w-32 bg-[--neutral-100] dark:bg-[--dark-border] rounded mb-6" />
      <div className="h-[200px] bg-[--neutral-100] dark:bg-[--dark-border] rounded" />
    </div>
  );
}
