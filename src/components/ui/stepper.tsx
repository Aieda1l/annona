"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Check, X, type LucideIcon } from "lucide-react";
import { cn } from "cn";

export type StepState = "complete" | "current" | "upcoming" | "halted";
export type StepItem = { label: string; description?: string; icon: LucideIcon; state: StepState };

const STATE_TEXT: Record<StepState, string> = {
  complete: "completed",
  current: "current step",
  upcoming: "not started",
  halted: "stopped here",
};

/**
 * Progress stepper. Pattern recreated locally from the MIT "Animated Progress Stepper" by ShadcnSpace on 21st.dev
 * (spring progress line, pulsing active badge, icon-to-check morph); the 21st registry install needs an API key we
 * do not have, so this is an original implementation on Annona tokens.
 *
 * Display only: callers derive `state` from server status. `halted` marks a terminal off-path state (rejected,
 * canceled, expired) and is drawn with an X, never as completed.
 */
export function Stepper({ steps, className, label = "Progress" }: { steps: StepItem[]; className?: string; label?: string }) {
  const lastDone = steps.reduce((acc, s, i) => (s.state === "complete" || s.state === "current" || s.state === "halted" ? i : acc), 0);
  const progress = steps.length > 1 ? lastDone / (steps.length - 1) : 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn("relative", className)}>
        <div aria-hidden className="absolute top-5 right-[calc(50%/var(--n))] left-[calc(50%/var(--n))] h-0.5 rounded-full bg-border" style={{ ["--n" as string]: steps.length }}>
          <motion.div
            className="h-full origin-left rounded-full bg-primary"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progress }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
        </div>
        <ol aria-label={label} className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => {
            const Icon = s.state === "complete" ? Check : s.state === "halted" ? X : s.icon;
            return (
              <li
                key={s.label}
                aria-current={s.state === "current" ? "step" : undefined}
                className="flex min-w-0 flex-col items-center gap-2 px-1 text-center"
              >
                <span
                  className={cn(
                    "relative flex size-10 items-center justify-center rounded-full border-2 bg-card transition-colors duration-300",
                    s.state === "complete" && "border-primary bg-primary text-primary-foreground",
                    s.state === "current" && "animate-pulse-ring border-primary text-primary",
                    s.state === "upcoming" && "border-border text-muted-foreground",
                    s.state === "halted" && "border-danger-border bg-danger-subtle text-danger",
                  )}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={`${s.state}-${i}`}
                      initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="flex"
                    >
                      <Icon aria-hidden className="size-4.5" strokeWidth={2.25} />
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "text-xs font-semibold sm:text-sm",
                      s.state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                      s.state === "halted" && "text-danger",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="sr-only">, {STATE_TEXT[s.state]}</span>
                  {s.description && <span className="hidden text-xs text-muted-foreground sm:block">{s.description}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </MotionConfig>
  );
}
