import type {
  OnboardingChecklistDTO,
  OnboardingPresentationAction,
  OnboardingPresentationDTO,
} from "@/contracts/onboarding";

/**
 * Typed client for the onboarding checklist routes (5.ONBOARD-1 Batch 1).
 * Components never call fetch() directly (project rule) — feature hooks go
 * through these helpers, which normalize errors into `OnboardingApiError`.
 */

export type OnboardingApiErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_ACCOUNT_MEMBER"
  | "ACCOUNT_PENDING_DELETION"
  | "WORKFLOW_NOT_FOUND"
  | "ONBOARDING_DISABLED"
  | "ONBOARDING_UNAVAILABLE"
  | "BAD_REQUEST"
  | "UNKNOWN";

export class OnboardingApiError extends Error {
  constructor(
    message: string,
    public readonly code: OnboardingApiErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OnboardingApiError";
  }
}

const KNOWN_CODES: readonly OnboardingApiErrorCode[] = [
  "UNAUTHENTICATED",
  "NOT_ACCOUNT_MEMBER",
  "ACCOUNT_PENDING_DELETION",
  "WORKFLOW_NOT_FOUND",
  "ONBOARDING_DISABLED",
  "ONBOARDING_UNAVAILABLE",
];

async function parseError(res: Response): Promise<OnboardingApiError> {
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as { error?: string; code?: string };
  } catch {
    /* not json */
  }
  const raw = body.code ?? body.error;
  const code = KNOWN_CODES.includes(raw as OnboardingApiErrorCode)
    ? (raw as OnboardingApiErrorCode)
    : res.status === 400
      ? "BAD_REQUEST"
      : "UNKNOWN";
  return new OnboardingApiError(
    body.error ?? `Onboarding request failed (HTTP ${res.status}).`,
    code,
    res.status,
  );
}

export async function getOnboardingChecklist(): Promise<OnboardingChecklistDTO> {
  const res = await fetch("/api/onboarding", { method: "GET" });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as OnboardingChecklistDTO;
}

export interface OnboardingPresentationResult {
  ok: true;
  presentation: OnboardingPresentationDTO;
  selectedWorkflowId: string | null;
}

export async function postOnboardingPresentation(
  action: OnboardingPresentationAction,
): Promise<OnboardingPresentationResult> {
  const res = await fetch("/api/onboarding/presentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as OnboardingPresentationResult;
}
