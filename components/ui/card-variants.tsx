import { cn } from "@/lib/utils";

interface CardVariantProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "bordered" | "glass";
}

export function DefaultCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl bg-white border border-neutral-200 p-6 dark:bg-dark-surface dark:border-dark-border", className)}
      {...props}
    />
  );
}

export function ElevatedCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl bg-white shadow-lg border-0 p-6 dark:bg-dark-surface", className)}
      {...props}
    />
  );
}

export function BorderedCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl bg-white border-2 border-neutral-300 p-6 dark:bg-dark-surface dark:border-dark-border", className)}
      {...props}
    />
  );
}

export function GlassCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl bg-white/60 backdrop-blur-md border border-white/40 shadow-lg p-6 dark:bg-dark-surface/60 dark:border-dark-border/40", className)}
      {...props}
    />
  );
}

export function CardVariant({ variant = "default", ...props }: CardVariantProps) {
  switch (variant) {
    case "elevated": return <ElevatedCard {...props} />;
    case "bordered": return <BorderedCard {...props} />;
    case "glass": return <GlassCard {...props} />;
    default: return <DefaultCard {...props} />;
  }
}
