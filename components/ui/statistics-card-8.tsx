"use client";

import { Badge2 } from "@/components/ui/badge-2";
import { Card, CardContent } from "@/components/ui/card-sean0205";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCard8Badge {
  color: string;
  icon: LucideIcon;
  iconColor: string;
  text: string;
}

interface StatCard8Props {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  badge: StatCard8Badge;
  value: string | number;
  dateRange?: string;
  className?: string;
}

export function StatisticCard8({
  icon: Icon,
  iconColor = "text-green-600",
  title,
  badge,
  value,
  dateRange,
  className,
}: StatCard8Props) {
  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex flex-col h-full">
        {/* Title & Badge */}
        <div className="flex items-center justify-between mb-8">
          <Icon className={cn("size-6", iconColor)} />
          <Badge2
            variant={
              badge.color.includes("green")
                ? "success"
                : badge.color.includes("red")
                ? "destructive"
                : badge.color.includes("blue")
                ? "info"
                : badge.color.includes("amber") || badge.color.includes("yellow")
                ? "warning"
                : "secondary"
            }
            size="sm"
            className="flex items-center gap-1"
          >
            <badge.icon className={cn("size-3", badge.iconColor)} />
            {badge.text}
          </Badge2>
        </div>

        {/* Value & Date Range */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="text-base font-medium text-muted-foreground mb-1">{title}</div>
            <div className="text-3xl font-bold text-foreground mb-6">
              {typeof value === "number" ? value.toLocaleString() : value}
            </div>
          </div>
          {dateRange && (
            <div className="pt-3 border-t border-border text-xs text-muted-foreground font-medium">
              {dateRange}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Convenience grid wrapper matching the 21st.dev demo layout
interface StatisticCards8Props {
  cards: StatCard8Props[];
  className?: string;
}

export function StatisticCards8({ cards, className }: StatisticCards8Props) {
  return (
    <div className={cn("@container w-full", className)}>
      <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-6">
        {cards.map((card, i) => (
          <StatisticCard8 key={i} {...card} />
        ))}
      </div>
    </div>
  );
}

export default StatisticCards8;
