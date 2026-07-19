"use client";

import { useEffect } from "react";
import type { CollaborationChecklistDTO } from "@/contracts/collaborationOnboarding";
import { OnboardingMinimizedBar } from "../OnboardingMinimizedBar";
import { CollaborationChecklistCard } from "./CollaborationChecklistCard";
import { CollaborationSuccessCard } from "./CollaborationSuccessCard";
import { TRACK_TITLE } from "./collaborationCopy";
import { useCollaborationChecklist } from "./useCollaborationChecklist";

/**
 * Collaboration checklist orchestrator (5.ONBOARD-4) — decides which state
 * renders (expanded card / minimized pill / success / nothing) from the
 * server-derived DTO + persisted presentation. Mirrors `OnboardingChecklist`.
 *
 * `isCollaborationChecklistVisible` below is exported and used by the COORDINATOR
 * to decide which single card owns the floating slot, so the visibility rule
 * lives in exactly one place and the two components can never disagree about
 * whether this card is on screen.
 */
export function isCollaborationChecklistVisible(
  checklist: CollaborationChecklistDTO | null,
): boolean {
  if (checklist === null) return false;
  if (checklist.presentation.dismissed) return false;
  // A completed track stays on screen only long enough to celebrate once. A
  // SILENTLY latched historical completion has celebrationPending=false from the
  // start, so it never appears at all — an owner whose setup was already done
  // before this shipped gets no card and no celebration.
  if (checklist.completed && !checklist.presentation.celebrationPending) {
    return false;
  }
  return true;
}

export function CollaborationChecklist({
  initial,
  onVisibilityChange,
}: {
  initial: CollaborationChecklistDTO | null;
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const {
    checklist,
    actionPending,
    actionError,
    dismiss,
    minimize,
    expand,
    acknowledgeCelebration,
  } = useCollaborationChecklist(initial);

  const visible = isCollaborationChecklistVisible(checklist);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  if (!visible || !checklist) return null;

  const { presentation } = checklist;

  return (
    // Same fixed bottom-right placement as the workflow checklist. Only ONE of
    // the two ever mounts (see OnboardingWidget), so the shared corner and the
    // shared z-40 can never produce two overlapping cards.
    <div
      data-testid="collab-checklist"
      className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] left-4 right-4 z-40 flex justify-end sm:left-auto sm:bottom-6 sm:right-6 sm:max-w-sm"
    >
      <div className="pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col sm:max-h-[calc(100dvh-3rem)] sm:w-96">
        {checklist.completed ? (
          <CollaborationSuccessCard
            track={checklist.track}
            onDone={() => void acknowledgeCelebration().then(() => dismiss())}
          />
        ) : presentation.minimized ? (
          <OnboardingMinimizedBar
            completedStepCount={checklist.completedStepCount}
            totalStepCount={checklist.totalStepCount}
            onExpand={() => void expand()}
            title={TRACK_TITLE[checklist.track]}
            testId="collab-minimized-bar"
          />
        ) : (
          <CollaborationChecklistCard
            checklist={checklist}
            actionPending={actionPending}
            onMinimize={() => void minimize()}
            onDismiss={() => void dismiss()}
          />
        )}
        {actionError && (
          <p
            role="alert"
            data-testid="collab-action-error"
            className="mt-1.5 text-xs text-destructive"
          >
            {actionError}
          </p>
        )}
      </div>
    </div>
  );
}
