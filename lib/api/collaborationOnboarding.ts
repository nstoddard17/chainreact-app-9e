import type {
  CollaborationChecklistDTO,
  CollaborationPresentationAction,
  CollaborationPresentationDTO,
  CollaborationTrack,
} from "@/contracts/collaborationOnboarding";
import { OnboardingApiError } from "./onboarding";

/**
 * Typed client for the collaboration-onboarding routes (5.ONBOARD-4).
 * Components never call fetch() directly (project rule) — feature hooks go
 * through these helpers. Reuses `OnboardingApiError` so callers handle one error
 * type across both checklists.
 */

async function parseError(res: Response): Promise<OnboardingApiError> {
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as { error?: string; code?: string };
  } catch {
    /* not json */
  }
  return new OnboardingApiError(
    body.error ?? `Collaboration onboarding request failed (HTTP ${res.status}).`,
    res.status === 400 ? "BAD_REQUEST" : "ONBOARDING_UNAVAILABLE",
    res.status,
  );
}

/** `null` = this account has no collaboration checklist (personal / not eligible). */
export async function getCollaborationChecklist(): Promise<CollaborationChecklistDTO | null> {
  const res = await fetch("/api/onboarding/collaboration", { method: "GET" });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as CollaborationChecklistDTO | null;
}

export interface CollaborationPresentationResult {
  ok: true;
  /** Echoed back from the SERVER's derivation — never sent by the client. */
  track: CollaborationTrack;
  presentation: CollaborationPresentationDTO;
}

export async function postCollaborationPresentation(
  action: CollaborationPresentationAction,
): Promise<CollaborationPresentationResult> {
  const res = await fetch("/api/onboarding/collaboration/presentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as CollaborationPresentationResult;
}
