"use client";

import { useCallback, useState } from "react";
import type { CollaborationChecklistDTO } from "@/contracts/collaborationOnboarding";
import type { OnboardingChecklistDTO } from "@/contracts/onboarding";
import {
  CollaborationChecklist,
  isCollaborationChecklistVisible,
} from "./collaboration/CollaborationChecklist";
import { OnboardingChecklist, type OnboardingVideoProps } from "./OnboardingChecklist";

/**
 * Floating-onboarding COORDINATOR (5.ONBOARD-4).
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * Both checklists are `position: fixed` in the SAME bottom-right corner at the
 * SAME z-40. Rendering both would stack two cards on top of each other. The
 * requirement is not merely "don't expand two at once" — a minimized pill and an
 * expanded card would still collide in that corner — so this component mounts
 * EXACTLY ONE checklist at a time. That makes overlap structurally impossible
 * rather than a matter of CSS luck, and it is why neither child needed its
 * positioner changed.
 *
 * ── PRIORITY ──────────────────────────────────────────────────────────────────
 * The collaboration checklist wins whenever it is visible:
 *   - an owner or admin of a new shared account is taught account setup first,
 *     because a workflow they build before inviting anyone is not yet shared work;
 *   - a newly joined member is taught how to participate first, because the
 *     workflow checklist would otherwise ask them to do account-level things in
 *     someone else's account.
 * Once that checklist is completed (celebration acknowledged) or dismissed,
 * `isCollaborationChecklistVisible` goes false and the regular workflow checklist
 * takes the slot if it is still incomplete.
 *
 * Personal accounts pass `collaboration={null}` and therefore see exactly the
 * behavior they had before this slice.
 *
 * Both DTOs are SERVER-RENDERED by the page, so the correct card is chosen during
 * SSR. There is no client-side fetch, no loading state, and therefore no window
 * in which a member could flash the owner card before the real state arrives.
 */
export function OnboardingWidget({
  workflow,
  collaboration,
  video = null,
  onVisibilityChange,
}: {
  workflow: OnboardingChecklistDTO | null;
  collaboration: CollaborationChecklistDTO | null;
  video?: OnboardingVideoProps | null;
  /** True while EITHER checklist occupies the floating slot. */
  onVisibilityChange?: (visible: boolean) => void;
}) {
  // Seeded from the server DTO so the very first render already picks the right
  // card; the child reports back if a presentation action changes visibility.
  const [collabVisible, setCollabVisible] = useState(() =>
    isCollaborationChecklistVisible(collaboration),
  );

  const handleCollabVisibility = useCallback(
    (visible: boolean) => {
      setCollabVisible(visible);
      // While collaboration owns the slot its visibility IS the widget's.
      if (visible) onVisibilityChange?.(true);
    },
    [onVisibilityChange],
  );

  if (collabVisible) {
    return (
      <CollaborationChecklist
        initial={collaboration}
        onVisibilityChange={handleCollabVisibility}
      />
    );
  }

  return (
    <OnboardingChecklist
      initial={workflow}
      video={video}
      onVisibilityChange={onVisibilityChange}
    />
  );
}
