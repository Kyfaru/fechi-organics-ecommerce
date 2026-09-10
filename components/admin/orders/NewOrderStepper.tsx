"use client";

import type { LucideIcon } from "lucide-react";
import { Check, Lock } from "lucide-react";

export type NewOrderStepKey = "customer" | "products" | "payment";

export interface NewOrderStep {
  key: NewOrderStepKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface NewOrderStepperProps {
  steps: NewOrderStep[];
  activeStep: NewOrderStepKey;
  /** Whether each step's own validation currently passes. */
  completedSteps: Record<NewOrderStepKey, boolean>;
  /** Steps that cannot be entered yet (e.g. Payment until Customer + Products are done). */
  disabledSteps?: Partial<Record<NewOrderStepKey, boolean>>;
  onStepClick: (step: NewOrderStepKey) => void;
}

/**
 * Vertical circle + connector step tracker for the in-store order wizard.
 * Visually adapted from components/account/orders/OrderStepper.tsx (which is a
 * read-only fulfillment-status display) into an interactive form-navigation
 * control: circles are clickable, a step can be "complete" without being
 * "active", and a step can be locked (disabled) until its prerequisites pass.
 */
export function NewOrderStepper({
  steps,
  activeStep,
  completedSteps,
  disabledSteps = {},
  onStepClick,
}: NewOrderStepperProps) {
  return (
    <div className="flex flex-col">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const done = completedSteps[step.key];
        const active = step.key === activeStep;
        const disabled = !!disabledSteps[step.key];
        const StepIcon = step.icon;

        const circleClasses = disabled
          ? "bg-(--neutral-100) text-(--neutral-300) cursor-not-allowed"
          : done
          ? "bg-(--green-800) text-white cursor-pointer hover:opacity-90"
          : active
          ? "bg-white border-2 border-(--green-800) text-(--green-800) cursor-pointer"
          : "bg-(--neutral-100) text-(--neutral-400) hover:bg-(--neutral-200) cursor-pointer";

        return (
          <div key={step.key} className="flex gap-4">
            {/* Circle + connector */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onStepClick(step.key)}
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                aria-label={`${step.label}${disabled ? " (locked)" : done ? " (complete)" : ""}`}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${circleClasses} ${
                  active && !disabled ? "ring-4 ring-(--green-100)" : ""
                }`}
              >
                {disabled ? <Lock size={14} /> : done ? <Check size={16} /> : <StepIcon size={16} />}
              </button>
              {!isLast && (
                <div
                  className={`w-0.5 flex-1 my-1 transition-colors ${done ? "bg-(--green-800)" : "bg-(--neutral-200)"}`}
                  style={{ minHeight: 40 }}
                />
              )}
            </div>

            {/* Label */}
            <div className={`pb-8 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
              <button
                type="button"
                onClick={() => onStepClick(step.key)}
                disabled={disabled}
                className={`text-left ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <p
                  className={`font-syne text-[15px] font-semibold leading-tight ${
                    disabled ? "text-(--neutral-300)" : active ? "text-(--green-900)" : "text-(--neutral-900)"
                  }`}
                >
                  {step.label}
                </p>
                <p className={`font-dm text-[12px] mt-0.5 ${disabled ? "text-(--neutral-300)" : "text-(--neutral-500)"}`}>
                  {disabled ? "Complete previous steps first" : step.description}
                </p>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
