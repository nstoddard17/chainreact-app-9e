"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { OnboardingStepDTO } from "@/contracts/onboarding";
import { postOnboardingEvent } from "@/lib/api/onboarding";
import { ObIcons } from "./onboardingIcons";
import { STEP_PRESENTATION, stepCta, stepDescription } from "./onboardingCopy";
import { stepHref } from "./utils/stepDestinations";

/**
 * One checklist step row (5.ONBOARD-1 Batch 2) — ports the design's `StepRow`
 * (src/onboarding-app.jsx + `.ob-step*` styles in Onboarding.html):
 * 26px square mark (icon → check on completion, pop animation), done rows get
 * a struck-through label + "Done" tag, the current row is highlighted and
 * expands to description + CTA. Deviations from the design demo (documented):
 * no "Mark done" skip (fake completion is forbidden — steps complete only via
 * real application state) and blocked rows render an explanation instead of a
 * dead CTA.
 */
export function OnboardingStepRow({
  step,
  selectedWorkflowId,
  expanded,
  onFocus,
  createChooser,
}: {
  step: OnboardingStepDTO;
  selectedWorkflowId: string | null;
  /** Whether this row renders its expanded body (current/blocked row). */
  expanded: boolean;
  onFocus: () => void;
  /** The create step's CTA area (chooser popover) — supplied by the card. */
  createChooser?: ReactNode;
}) {
  const presentation = STEP_PRESENTATION[step.key];
  const StepIcon = ObIcons[presentation.icon];
  const done = step.status === "complete";
  const blocked = step.status === "blocked";
  const href = stepHref(step, selectedWorkflowId);
  const cta = stepCta(step);

  return (
    <li
      data-testid={`onboarding-step-${step.key}`}
      data-status={step.status}
      aria-current={expanded && !done ? "step" : undefined}
      className={`flex gap-3 rounded-xl px-2.5 py-[11px] transition-colors ${
        expanded && !done ? "bg-accent/60 shadow-[inset_0_0_0_1px_hsl(var(--border))]" : ""
      }`}
    >
      <span className="mt-px flex-none">
        {done ? (
          <span
            data-testid={`onboarding-step-${step.key}-check`}
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
                done ? "font-medium text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"
              }`}
            >
              {presentation.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={onFocus}
              data-testid={`onboarding-step-${step.key}-focus`}
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
          {blocked && !done && (
            <span
              data-testid={`onboarding-step-${step.key}-blocked`}
              className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-[7px] py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.03em] text-warning"
            >
              {step.blockedReason === "admin_required" ? (
                <ObIcons.Lock size={10} />
              ) : (
                <ObIcons.AlertTriangle size={10} />
              )}
              {step.blockedReason === "admin_required"
                ? "Admin needed"
                : step.blockedReason === "reconnect_required"
                  ? "Reconnect"
                  : "Waiting"}
            </span>
          )}
        </div>
        {expanded && !done && (
          <div>
            <p className="mb-[11px] mt-[5px] text-[12.5px] leading-normal text-muted-foreground">
              {stepDescription(step)}
            </p>
            {step.key === "connect" && (step.providers?.length ?? 0) > 0 && (
              <ul
                data-testid="onboarding-connect-providers"
                aria-label="Apps this workflow needs"
                className="mb-[11px] flex flex-wrap gap-1.5"
              >
                {step.providers!.map((p) => (
                  <li
                    key={p.provider}
                    data-testid={`onboarding-provider-${p.provider}`}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                      p.ready
                        ? "bg-success/10 text-success"
                        : "bg-card text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]"
                    }`}
                  >
                    {p.ready && <ObIcons.Check size={10} />}
                    {p.name ?? p.provider}
                    {!p.ready && p.reconnectNeeded && (
                      <span className="text-warning">· reconnect</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              {step.key === "create"
                ? createChooser
                : cta !== null &&
                  href !== null && (
                    <Link
                      href={href}
                      data-testid={`onboarding-step-${step.key}-cta`}
                      onClick={() =>
                        postOnboardingEvent({ event: "cta_clicked", stepKey: step.key })
                      }
                      className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-primary px-[13px] py-2 text-[13px] font-semibold text-primary-foreground transition hover:brightness-110 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {cta}
                      <ObIcons.Arrow size={14} />
                    </Link>
                  )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
