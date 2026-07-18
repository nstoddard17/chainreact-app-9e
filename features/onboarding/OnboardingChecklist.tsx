"use client";

import { useEffect } from "react";
import type { OnboardingChecklistDTO } from "@/contracts/onboarding";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import { OnboardingMinimizedBar } from "./OnboardingMinimizedBar";
import { OnboardingSuccessCard } from "./OnboardingSuccessCard";
import { useOnboardingChecklist } from "./hooks/useOnboardingChecklist";

/**
 * Onboarding checklist orchestrator (5.ONBOARD-1 Batch 2) — decides which of
 * the imported design's states renders (expanded card / minimized pill /
 * success / nothing) from the server-derived DTO + persisted presentation.
 *
 * Visibility contract:
 *   - flag off, derivation failed (initial null), or dismissed → renders
 *     nothing; `/workflows` is never blocked by onboarding.
 *   - completed → the success card, and ONLY while the celebration is
 *     unacknowledged (silently-latched pre-existing accounts never see it).
 *   - otherwise → expanded card or the minimized pill.
 *
 * `onVisibilityChange` lets the dashboard suppress its own no-workflows empty
 * state while the checklist occupies that role (no duplicated CTA).
 */
export function OnboardingChecklist({
  initial,
  onVisibilityChange,
}: {
  initial: OnboardingChecklistDTO | null;
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const {
    checklist,
    actionPending,
    actionError,
    dismiss,
    minimize,
    expand,
    selectWorkflow,
    acknowledgeCelebration,
  } = useOnboardingChecklist(initial);

  const presentation = checklist?.presentation;
  const completed = checklist?.completed === true;
  const visible =
    checklist !== null &&
    checklist.enabled &&
    presentation !== undefined &&
    !presentation.dismissed &&
    (!completed || presentation.celebrationPending);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  if (!visible || !checklist) return null;

  return (
    <div data-testid="onboarding-checklist" className="mb-2">
      {completed ? (
        <OnboardingSuccessCard
          completionWorkflow={checklist.completionWorkflow ?? null}
          onDone={() => void acknowledgeCelebration().then(() => dismiss())}
        />
      ) : presentation!.minimized ? (
        <OnboardingMinimizedBar
          completedStepCount={checklist.completedStepCount ?? 0}
          totalStepCount={checklist.totalStepCount ?? 5}
          onExpand={() => void expand()}
        />
      ) : (
        <OnboardingChecklistCard
          checklist={checklist}
          actionPending={actionPending}
          onMinimize={() => void minimize()}
          onDismiss={() => void dismiss()}
          onSelectWorkflow={(id) => void selectWorkflow(id)}
        />
      )}
      {actionError && (
        <p
          role="alert"
          data-testid="onboarding-action-error"
          className="mt-1.5 text-xs text-destructive"
        >
          {actionError}
        </p>
      )}
    </div>
  );
}
