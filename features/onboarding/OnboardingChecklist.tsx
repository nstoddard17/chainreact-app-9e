"use client";

import { useEffect, useState } from "react";
import type { OnboardingChecklistDTO } from "@/contracts/onboarding";
import { postOnboardingEvent } from "@/lib/api/onboarding";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import { OnboardingMinimizedBar } from "./OnboardingMinimizedBar";
import { OnboardingSuccessCard } from "./OnboardingSuccessCard";
import { OnboardingVideoModal } from "./OnboardingVideoModal";
import { useOnboardingChecklist } from "./hooks/useOnboardingChecklist";

export interface OnboardingVideoProps {
  readonly videoUrl: string;
  readonly captionsUrl: string | null;
}

/**
 * Onboarding checklist orchestrator (5.ONBOARD-1 Batch 2) — decides which of
 * the imported design's states renders (expanded card / minimized pill /
 * success / nothing) from the server-derived DTO + persisted presentation.
 *
 * Visibility contract:
 *   - derivation failed (initial null) or dismissed → renders nothing;
 *     `/workflows` is never blocked by onboarding.
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
  video = null,
}: {
  initial: OnboardingChecklistDTO | null;
  onVisibilityChange?: (visible: boolean) => void;
  /** Server-configured optional video (null = surface hidden entirely). */
  video?: OnboardingVideoProps | null;
}) {
  const {
    checklist,
    actionPending,
    actionError,
    dismiss,
    minimize,
    expand,
    acknowledgeCelebration,
    videoWatched,
  } = useOnboardingChecklist(initial);
  const [videoOpen, setVideoOpen] = useState(false);

  const presentation = checklist?.presentation;
  const completed = checklist?.completed === true;
  const visible =
    checklist !== null &&
    presentation !== undefined &&
    !presentation.dismissed &&
    (!completed || presentation.celebrationPending);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  if (!visible || !checklist) return null;

  return (
    // FIXED bottom-right widget (5.ONBOARD-2). Pinned to the viewport rather
    // than sitting in the dashboard flow, so it never reserves layout space and
    // never shifts on scroll.
    //   - desktop/tablet: 24px from the right and bottom (`sm:` inset)
    //   - small mobile: 16px side margins + safe-area inset, so it clears
    //     home-indicator / notch chrome and can never exceed the viewport
    //   - max-height caps to the viewport and the BODY scrolls internally
    //     (see OnboardingChecklistCard), so a long card is never clipped
    //   - `pointer-events-none` on the positioner keeps the page clickable
    //     around the card; the card itself re-enables them
    // z-40 sits above page content and the sidebar but BELOW modals/toasts
    // (z-50), so it can never cover a dialog or a persistent nav control.
    <>
      <div
        data-testid="onboarding-checklist"
        className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] left-4 right-4 z-40 flex justify-end sm:left-auto sm:bottom-6 sm:right-6 sm:max-w-sm"
      >
      <div className="pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col sm:max-h-[calc(100dvh-3rem)] sm:w-96">
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
            footerExtras={
              video ? (
                <button
                  type="button"
                  data-testid="onboarding-video-open"
                  onClick={() => {
                    postOnboardingEvent({ event: "video_opened" });
                    setVideoOpen(true);
                  }}
                  className="rounded-[7px] px-2 py-[5px] text-xs text-muted-foreground/70 transition hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  See how it works — 1 min
                </button>
              ) : undefined
            }
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
      </div>
      {/* Rendered OUTSIDE the fixed positioner: the modal owns the full
          viewport and must not inherit the widget's corner placement,
          max-height, or pointer-events gating. */}
      {videoOpen && video && (
        <OnboardingVideoModal
          videoUrl={video.videoUrl}
          captionsUrl={video.captionsUrl}
          onWatched={() => void videoWatched()}
          onClose={() => setVideoOpen(false)}
        />
      )}
    </>
  );
}
