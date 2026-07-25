"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { OnboardingStepDTO } from "@/contracts/onboarding";
import { postOnboardingEvent } from "@/lib/api/onboarding";
import { ObIcons } from "./onboardingIcons";
import { STEP_PRESENTATION, stepCta, stepDescription } from "./onboardingCopy";
import { stepHref } from "./utils/stepDestinations";
import { resolveHelpLink } from "@/features/marketing/help/contextualHelp";

/**
 * One checklist step row (5.ONBOARD-1 Batch 2) — ports the design's `StepRow`
 * (src/onboarding-app.jsx + `.ob-step*` styles in Onboarding.html):
 * 26px square mark (icon → check on completion, pop animation), done rows get
 * a struck-through label + "Done" tag, the current row is highlighted and
 * expands to description + CTA. Deviations from the design demo (documented):
 * no "Mark done" skip (fake completion is forbidden — steps complete only via
 * real application state) and a step never renders a dead CTA.
 */
export function OnboardingStepRow({
  step,
  expanded,
  onFocus,
  createChooser,
}: {
  step: OnboardingStepDTO;
  /** Whether this row renders its expanded body (the current row). */
  expanded: boolean;
  onFocus: () => void;
  /** The create step's CTA area (chooser popover) — supplied by the card. */
  createChooser?: ReactNode;
}) {
  const presentation = STEP_PRESENTATION[step.key];
  const StepIcon = ObIcons[presentation.icon];
  const done = step.status === "complete";
  const href = stepHref(step);
  const cta = stepCta(step);

  // HELP-CENTER-CONTEXTUAL-1 — restrained "Learn how" link to the step's
  // Help Center article (central resolver; null → no link). Secondary to the
  // primary CTA; deliberately NOT wired to postOnboardingEvent, so existing
  // onboarding analytics and completion behavior stay byte-identical.
  const help = resolveHelpLink({ type: "onboarding", step: step.key });

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
        </div>
        {expanded && !done && (
          <div>
            <p className="mb-[11px] mt-[5px] text-[12.5px] leading-normal text-muted-foreground">
              {stepDescription(step)}
            </p>
            {/* 5.ONBOARD-3: no provider chips. The Connect step teaches the
                general action, so it names no app and shows no per-provider
                readiness — that belongs on the Apps page and in the builder. */}
            <div className="flex items-center gap-2.5">
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
              {help && (
                <Link
                  href={help.href}
                  data-testid={`onboarding-step-${step.key}-help-link`}
                  aria-label={`Learn how: ${presentation.label}`}
                  className="whitespace-nowrap rounded text-[12px] text-muted-foreground underline underline-offset-2 transition hover:text-foreground hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {help.label}
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
