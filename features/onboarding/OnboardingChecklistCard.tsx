"use client";

import { useState, type ReactNode } from "react";
import type { OnboardingChecklistDTO } from "@/contracts/onboarding";
import { MarketingBrandLogo } from "@/features/marketing/MarketingBrandLogo";
import { ObIcons } from "./onboardingIcons";
import { OnboardingCreateChooser } from "./OnboardingCreateChooser";
import { OnboardingStepRow } from "./OnboardingStepRow";
import { OnboardingWorkflowPicker } from "./OnboardingWorkflowPicker";

/**
 * Expanded checklist card (5.ONBOARD-1 Batch 2) — ports the design's
 * `.ob-card`: header (brand mark + title + "N of M steps done" + minimize
 * chevron), 3px gradient progress bar, step list, footer actions. Width holds
 * the design's 384px card (`max-w-sm`) inline in the dashboard slot.
 *
 * Presentation-only: every step's status arrives derived from the server DTO;
 * the card renders it and never computes or submits completion.
 */
export function OnboardingChecklistCard({
  checklist,
  actionPending,
  onMinimize,
  onDismiss,
  onSelectWorkflow,
  footerExtras,
}: {
  checklist: OnboardingChecklistDTO;
  actionPending: boolean;
  onMinimize: () => void;
  onDismiss: () => void;
  onSelectWorkflow: (workflowId: string) => void;
  footerExtras?: ReactNode;
}) {
  const steps = checklist.steps ?? [];
  const done = checklist.completedStepCount ?? 0;
  const total = checklist.totalStepCount ?? steps.length;
  const fraction = total > 0 ? done / total : 0;
  const selectedId = checklist.selectedWorkflow?.id ?? null;

  // The expanded row: the derived current/blocked step by default; the user
  // can peek at another incomplete step (design's onFocus behavior). Reset on
  // DTO change is unnecessary — the derived index wins unless the user peeked.
  const derivedActiveKey =
    steps.find((s) => s.status === "current" || s.status === "blocked")?.key ?? null;
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const activeKey =
    peekKey && steps.some((s) => s.key === peekKey && s.status !== "complete")
      ? peekKey
      : derivedActiveKey;

  return (
    <section
      role="region"
      aria-label="Getting started"
      data-testid="onboarding-checklist-card"
      className="ob-animate-card-in w-full max-w-sm overflow-hidden rounded-[18px] bg-gradient-to-b from-accent/70 to-card shadow-[inset_0_0_0_1px_hsl(var(--border))]"
    >
      <div className="flex items-start justify-between gap-3 px-[18px] pb-3.5 pt-[17px]">
        <div className="flex items-start gap-[11px]">
          <span className="mt-px">
            <MarketingBrandLogo size={22} wordmark={false} variant="nav" />
          </span>
          <div>
            <h2 className="text-[15px] font-bold tracking-[-0.01em] text-foreground">
              Launch your first workflow
            </h2>
            <p
              data-testid="onboarding-progress-label"
              className="mt-0.5 text-[12.5px] text-muted-foreground"
            >
              {done === 0
                ? "Complete these steps to put your first automation to work."
                : `${done} of ${total} steps done`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onMinimize}
          disabled={actionPending}
          data-testid="onboarding-minimize"
          aria-label="Minimize the getting-started checklist"
          className="grid h-7 w-7 flex-none place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ObIcons.ChevronDown size={16} />
        </button>
      </div>

      <div className="mx-[18px] h-[3px] overflow-hidden rounded-[3px] bg-border">
        <div
          data-testid="onboarding-progress-fill"
          role="progressbar"
          aria-label="Getting started progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-full rounded-[3px] bg-gradient-to-r from-primary to-primary/60 transition-[width] duration-500"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <OnboardingWorkflowPicker
        options={checklist.workflowOptions ?? []}
        selectedId={selectedId}
        disabled={actionPending}
        onSelect={onSelectWorkflow}
      />

      <ol className="flex flex-col gap-0.5 px-2.5 pb-1.5 pt-2.5" aria-label="Setup steps">
        {steps.map((step) => (
          <OnboardingStepRow
            key={step.key}
            step={step}
            selectedWorkflowId={selectedId}
            expanded={activeKey === step.key}
            onFocus={() => setPeekKey(step.key)}
            createChooser={step.key === "create" ? <OnboardingCreateChooser /> : undefined}
          />
        ))}
      </ol>

      <div className="flex gap-1 px-3.5 pb-[13px] pt-1.5">
        <button
          type="button"
          onClick={onDismiss}
          disabled={actionPending}
          data-testid="onboarding-dismiss"
          className="rounded-[7px] px-2 py-[5px] text-xs text-muted-foreground/70 transition hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Dismiss guide
        </button>
        {footerExtras}
      </div>
    </section>
  );
}
