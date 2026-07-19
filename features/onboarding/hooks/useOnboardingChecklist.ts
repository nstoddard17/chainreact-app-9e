"use client";

import { useCallback, useState } from "react";
import type {
  OnboardingChecklistDTO,
  OnboardingPresentationAction,
} from "@/contracts/onboarding";
import {
  getOnboardingChecklist,
  postOnboardingPresentation,
} from "@/lib/api/onboarding";

/**
 * Client state + actions for the onboarding checklist (5.ONBOARD-1 Batch 2).
 *
 * The server-derived DTO is the truth; this hook only sequences presentation
 * mutations (dismiss / minimize / expand / select / celebrate) and refetches.
 * Mutation failure restores the previous DTO and surfaces a quiet error —
 * derived progress is never touched client-side.
 */
export function useOnboardingChecklist(initial: OnboardingChecklistDTO | null) {
  const [checklist, setChecklist] = useState<OnboardingChecklistDTO | null>(initial);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setChecklist(await getOnboardingChecklist());
    } catch {
      // Keep the last-known DTO — the checklist must never break the page.
    }
  }, []);

  const act = useCallback(
    async (
      action: OnboardingPresentationAction,
      optimistic: (prev: OnboardingChecklistDTO) => OnboardingChecklistDTO,
      opts: { refetch?: boolean } = {},
    ) => {
      setActionError(null);
      setActionPending(true);
      let previous: OnboardingChecklistDTO | null = null;
      setChecklist((prev) => {
        previous = prev;
        return prev ? optimistic(prev) : prev;
      });
      try {
        await postOnboardingPresentation(action);
        if (opts.refetch) await refresh();
      } catch {
        setChecklist(previous);
        setActionError("Couldn't save that just now. Try again.");
      } finally {
        setActionPending(false);
      }
    },
    [refresh],
  );

  const patchPresentation = (
    prev: OnboardingChecklistDTO,
    patch: Partial<NonNullable<OnboardingChecklistDTO["presentation"]>>,
  ): OnboardingChecklistDTO => ({
    ...prev,
    presentation: prev.presentation ? { ...prev.presentation, ...patch } : prev.presentation,
  });

  return {
    checklist,
    actionPending,
    actionError,
    refresh,
    dismiss: () =>
      act({ action: "dismiss" }, (p) => patchPresentation(p, { dismissed: true })),
    reopen: () =>
      act({ action: "reopen" }, (p) =>
        patchPresentation(p, { dismissed: false, minimized: false }),
      ),
    minimize: () =>
      act({ action: "minimize" }, (p) => patchPresentation(p, { minimized: true })),
    expand: () =>
      act({ action: "expand" }, (p) => patchPresentation(p, { minimized: false })),
    videoWatched: () =>
      act({ action: "video_watched" }, (p) =>
        patchPresentation(p, { videoWatched: true }),
      ),
    acknowledgeCelebration: () =>
      act({ action: "celebrated" }, (p) =>
        patchPresentation(p, { celebrationPending: false }),
      ),
  };
}
