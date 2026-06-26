"use client";

import { cn } from "@/lib/utils";

interface StatCardWithLink {
  name: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  href?: string;
  linkLabel?: string;
}

interface StatsCardsWithLinksProps {
  cards: StatCardWithLink[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export function StatsCardsWithLinks({
  cards,
  columns = 3,
  className,
}: StatsCardsWithLinksProps) {
  const colClass = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return (
    <dl className={cn("grid grid-cols-1 gap-6 w-full", colClass, className)}>
      {cards.map((item) => (
        <div
          key={item.name}
          className="bg-card text-card-foreground flex flex-col gap-0 rounded-xl border shadow-sm overflow-hidden"
        >
          {/* Main content */}
          <div className="px-6 py-5">
            <dd className="flex items-start justify-between gap-2 mb-1">
              <span className="truncate text-sm text-muted-foreground">{item.name}</span>
              {item.change && (
                <span
                  className={cn(
                    "text-sm font-medium shrink-0",
                    item.changeType === "positive"
                      ? "text-emerald-700 dark:text-emerald-500"
                      : item.changeType === "negative"
                      ? "text-red-700 dark:text-red-500"
                      : "text-muted-foreground"
                  )}
                >
                  {item.change}
                </span>
              )}
            </dd>
            <dd className="text-3xl font-semibold text-foreground">
              {item.value}
            </dd>
          </div>

          {/* Footer link */}
          {item.href && (
            <div className="flex justify-end border-t border-border px-0 py-0">
              <a
                href={item.href}
                className="block w-full px-6 py-3 text-sm font-medium text-primary hover:text-primary/80 text-right transition-colors"
              >
                {item.linkLabel ?? "View more →"}
              </a>
            </div>
          )}
        </div>
      ))}
    </dl>
  );
}

export default StatsCardsWithLinks;
