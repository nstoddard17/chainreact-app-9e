"use client";

import Link from "next/link";
import type { CollaborationStepDTO } from "@/contracts/collaborationOnboarding";
import { ObIcons } from "../onboardingIcons";
import { COLLABORATION_STEP_PRESENTATION } from "./collaborationCopy";

/**
 * One collaboration checklist step row (5.ONBOARD-4). Mirrors
 * `OnboardingStepRow`'s visual language so the two cards read as one system,
 * against the collaboration DTO instead of the workflow one.
 *
 * Same two honesty rules as its sibling: no "Mark done" affordance (steps
 * complete only from real server-derived state) and no dead CTAs. Every CTA is a
 * `next/link` to a page — never a mutation.
 */
export function CollaborationStepRow({
  step,
  expanded,
  onFocus,
}: {
  step: CollaborationStepDTO;
  /** Whether this row renders its expanded body (the current row). */
  expanded: boolean;
  onFocus: () => void;
}) {
  const presentation = COLLABORATION_STEP_PRESENTATION[step.key];
  const StepIcon = ObIcons[presentation.icon];
  const done = step.status === "complete";

  return (
    <li
      data-testid={`collab-step-${step.key}`}
      data-status={step.status}
      aria-current={expanded && !done ? "step" : undefined}
      className={`flex gap-3 rounded-xl px-2.5 py-[11px] transition-colors ${
        expanded && !done
          ? "bg-accent/60 shadow-[inset_0_0_0_1px_hsl(var(--border))]"
          : ""
      }`}
    >
      <span className="mt-px flex-none">
        {done ? (
          <span
            data-testid={`collab-step-${step.key}-check`}
            className="ob-animate-check-pop grid h-[26px] w-[26px] place-items-center rounded-lg bg-primary text-primary-foreground"
          >
            <ObIcons.Check size={13} />
          </span>
        ) : (
          <span
            className={`grid h-[26px] w-[26px] place-items-center rounded-lg ${
              expanded
                ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
                : "bg-card text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]"
            }`}
          >
            <StepIcon size={14} />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-[26px] items-center gap-2">
          {done || expanded ? (
            <span
              className={`text-[13.5px] font-semibold ${
                done
                  ? "font-medium text-muted-foreground line-through decoration-muted-foreground/50"
                  : "text-foreground"
              }`}
            >
              {presentation.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={onFocus}
              data-testid={`collab-step-${step.key}-focus`}
              className="rounded text-left text-[13.5px] font-semibold text-foreground hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {presentation.label}
            </button>
          )}
          {done && (
            <span className="rounded-full bg-success/10 px-[7px] py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.03em] text-success">
              Done
            </span>
          )}
        </div>
        {expanded && !done && (
          <div>
            <p className="mb-[11px] mt-[5px] text-[12.5px] leading-normal text-muted-foreground">
              {presentation.description}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={presentation.href}
                data-testid={`collab-step-${step.key}-cta`}
                className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-primary px-[13px] py-2 text-[13px] font-semibold text-primary-foreground transition hover:brightness-110 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {presentation.cta}
                <ObIcons.Arrow size={14} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
