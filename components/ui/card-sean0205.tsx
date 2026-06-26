"use client";
import { createContext, useContext } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type CardVariant = "default" | "accent";
const CardContext = createContext<{ variant: CardVariant }>({ variant: "default" });

const cardVariants = cva("rounded-xl border transition-shadow", {
  variants: {
    variant: {
      default: "bg-white border-neutral-200 shadow-sm dark:bg-dark-surface dark:border-dark-border",
      accent: "bg-green-50 border-green-200 shadow-sm dark:bg-green-900/10 dark:border-green-800",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant = "default", children, ...props }: CardProps) {
  return (
    <CardContext.Provider value={{ variant: variant ?? "default" }}>
      <div className={cn(cardVariants({ variant }), className)} {...props}>
        {children}
      </div>
    </CardContext.Provider>
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}

export function CardHeading({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const { variant } = useContext(CardContext);
  return (
    <h3
      className={cn(
        "text-base font-semibold",
        variant === "accent" ? "text-green-900 dark:text-green-300" : "text-neutral-900 dark:text-neutral-100",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-xl font-bold text-neutral-900 dark:text-neutral-100", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-neutral-500 dark:text-neutral-400", className)} {...props} />;
}

export function CardToolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2", className)} {...props} />;
}
