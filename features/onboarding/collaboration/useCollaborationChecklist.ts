"use client";

import { useCallback, useState } from "react";
import type {
  CollaborationChecklistDTO,
  CollaborationPresentationAction,
} from "@/contracts/collaborationOnboarding";
import { postCollaborationPresentation } from "@/lib/api/collaborationOnboarding";

/**
 * Client state + actions for the collaboration checklist (5.ONBOARD-4).
 *
 * The server-derived DTO is the truth; this hook only sequences presentation
 * mutations. Mutation failure restores the previous DTO and surfaces a quiet
 * error — derived progress and the TRACK are never touched client-side.
 *
 * Note the hook never sends a track: the route re-derives it from live role
 * state. So a stale client DTO can, at worst, write presentation state for the
 * user's CURRENT track — never another role's record.
 */
export function useCollaborationChecklist(
  initial: CollaborationChecklistDTO | null,
) {
  const [checklist, setChecklist] = useState<CollaborationChecklistDTO | null>(
    initial,
  );
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = useCallback(
    async (
      action: CollaborationPresentationAction,
      optimistic: (prev: CollaborationChecklistDTO) => CollaborationChecklistDTO,
    ) => {
      setActionError(null);
      setActionPending(true);
      let previous: CollaborationChecklistDTO | null = null;
      setChecklist((prev) => {
        previous = prev;
        return prev ? optimistic(prev) : prev;
      });
      try {
        await postCollaborationPresentation(action);
      } catch {
        setChecklist(previous);
        setActionError("Couldn't save that just now. Try again.");
      } finally {
        setActionPending(false);
      }
    },
    [],
  );

  const patch = (
    prev: CollaborationChecklistDTO,
    p: Partial<CollaborationChecklistDTO["presentation"]>,
  ): CollaborationChecklistDTO => ({
    ...prev,
    presentation: { ...prev.presentation, ...p },
  });

  return {
    checklist,
    actionPending,
    actionError,
    dismiss: () => act({ action: "dismiss" }, (p) => patch(p, { dismissed: true })),
    minimize: () =>
      act({ action: "minimize" }, (p) => patch(p, { minimized: true })),
    expand: () => act({ action: "expand" }, (p) => patch(p, { minimized: false })),
    acknowledgeCelebration: () =>
      act({ action: "celebrated" }, (p) => patch(p, { celebrationPending: false })),
  };
}
