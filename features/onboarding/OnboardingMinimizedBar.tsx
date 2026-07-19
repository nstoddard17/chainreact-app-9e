"use client";

import { ObIcons } from "./onboardingIcons";
import { OnboardingProgressRing } from "./OnboardingProgressRing";

/**
 * Minimized checklist presentation (5.ONBOARD-1 Batch 2) — ports the design's
 * collapsed `.ob-pill` (progress ring + "Finish setup" + "N of M complete" +
 * chevron). Design deviation (documented): the pill sits inline in the
 * dashboard's onboarding slot rather than floating fixed bottom-right — the
 * task locks dashboard placement above the stat cards and forbids persistent
 * floating chrome.
 */
export function OnboardingMinimizedBar({
  completedStepCount,
  totalStepCount,
  onExpand,
  title = "Launch your first workflow",
  testId = "onboarding-minimized-bar",
}: {
  completedStepCount: number;
  totalStepCount: number;
  onExpand: () => void;
  /**
   * 5.ONBOARD-4 — which checklist this pill collapses. Defaults to the
   * first-workflow copy so existing callers are unchanged; the collaboration
   * checklist passes its per-track title so the accessible name names the RIGHT
   * checklist rather than telling a team member to launch their first workflow.
   */
  title?: string;
  testId?: string;
}) {
  const fraction = totalStepCount > 0 ? completedStepCount / totalStepCount : 0;
  return (
    <button
      type="button"
      onClick={onExpand}
      data-testid={testId}
      aria-label={`${title} — ${completedStepCount} of ${totalStepCount} steps complete. Expand checklist.`}
      className="inline-flex items-center gap-3 rounded-[14px] bg-card py-[11px] pl-3 pr-[15px] text-left shadow-[inset_0_0_0_1px_hsl(var(--border))] transition hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_hsl(var(--primary))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0"
    >
      <OnboardingProgressRing fraction={fraction} />
      <span className="flex flex-col items-start leading-[1.3]">
        <span className="text-[13.5px] font-semibold text-foreground">Finish setup</span>
        <span data-testid="onboarding-minimized-progress" className="text-xs text-muted-foreground">
          {completedStepCount} of {totalStepCount} complete
        </span>
      </span>
      <span className="text-muted-foreground">
        <ObIcons.ChevronUp size={16} />
      </span>
    </button>
  );
}
