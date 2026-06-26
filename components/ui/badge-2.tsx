"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badge2Variants = cva(
  "inline-flex items-center justify-center font-medium rounded-full transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        secondary: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
        success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
        warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        outline: "border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300",
        destructive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      },
      size: {
        xs: "px-1.5 py-0.5 text-[10px]",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-sm",
        lg: "px-3 py-1.5 text-base",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "sm",
    },
  }
);

export interface Badge2Props
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge2Variants> {}

export function Badge2({ className, variant, size, ...props }: Badge2Props) {
  return (
    <span className={cn(badge2Variants({ variant, size }), className)} {...props} />
  );
}
