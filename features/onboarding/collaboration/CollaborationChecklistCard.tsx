"use client";

import { useState } from "react";
import type { CollaborationChecklistDTO } from "@/contracts/collaborationOnboarding";
import { MarketingBrandLogo } from "@/features/marketing/MarketingBrandLogo";
import { ObIcons } from "../onboardingIcons";
import { CollaborationStepRow } from "./CollaborationStepRow";
import { TRACK_INTRO, TRACK_TITLE } from "./collaborationCopy";

/**
 * Expanded collaboration checklist card (5.ONBOARD-4). Same shell as
 * `OnboardingChecklistCard` so both cards read as one system; the heading, the
 * steps, and the `data-track` attribute all come from the server-derived track.
 *
 * Presentation-only: every step's status arrives derived from the server DTO;
 * the card renders it and never computes or submits completion.
 */
export function CollaborationChecklistCard({
  checklist,
  actionPending,
  onMinimize,
  onDismiss,
}: {
  checklist: CollaborationChecklistDTO;
  actionPending: boolean;
  onMinimize: () => void;
  onDismiss: () => void;
}) {
  const steps = checklist.steps;
  const done = checklist.completedStepCount;
  const total = checklist.totalStepCount;
  const fraction = total > 0 ? done / total : 0;

  const derivedActiveKey = steps.find((s) => s.status === "current")?.key ?? null;
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const activeKey =
    peekKey && steps.some((s) => s.key === peekKey && s.status !== "complete")
      ? peekKey
      : derivedActiveKey;

  return (
    <section
      role="region"
      aria-label="Team getting started"
      data-testid="collab-checklist-card"
      // The track is surfaced as an attribute so tests (and anyone debugging a
      // role-selection report) can see WHICH checklist rendered, not just its
      // steps.
      data-track={checklist.track}
      className="ob-animate-card-in flex min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-[18px] bg-gradient-to-b from-accent/70 to-card shadow-[inset_0_0_0_1px_hsl(var(--border))]"
    >
      <div className="flex items-start justify-between gap-3 px-[18px] pb-3.5 pt-[17px]">
        <div className="flex items-start gap-[11px]">
          <span className="mt-px">
            <MarketingBrandLogo size={22} wordmark={false} variant="nav" />
          </span>
          <div>
            <h2 className="text-[15px] font-bold tracking-[-0.01em] text-foreground">
              {TRACK_TITLE[checklist.track]}
            </h2>
            <p
              data-testid="collab-progress-label"
              className="mt-0.5 text-[12.5px] text-muted-foreground"
            >
              {done === 0
                ? TRACK_INTRO[checklist.track]
                : `${done} of ${total} steps done`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onMinimize}
          disabled={actionPending}
          data-testid="collab-minimize"
          aria-label="Minimize the team getting-started checklist"
          className="grid h-7 w-7 flex-none place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ObIcons.ChevronDown size={16} />
        </button>
      </div>

      <div className="mx-[18px] h-[3px] overflow-hidden rounded-[3px] bg-border">
        <div
          data-testid="collab-progress-fill"
          role="progressbar"
          aria-label="Team getting started progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-full rounded-[3px] bg-gradient-to-r from-primary to-primary/60 transition-[width] duration-500"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <ol
        data-testid="collab-step-list"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2.5 pb-1.5 pt-2.5"
        aria-label="Team setup steps"
      >
        {steps.map((step) => (
          <CollaborationStepRow
            key={step.key}
            step={step}
            expanded={activeKey === step.key}
            onFocus={() => setPeekKey(step.key)}
          />
        ))}
      </ol>

      <div className="flex gap-1 px-3.5 pb-[13px] pt-1.5">
        <button
          type="button"
          onClick={onDismiss}
          disabled={actionPending}
          data-testid="collab-dismiss"
          aria-label="Dismiss the collaboration guide"
          className="rounded-[7px] px-2 py-[5px] text-xs text-muted-foreground/70 transition hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
