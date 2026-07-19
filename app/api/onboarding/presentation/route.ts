import { NextResponse } from "next/server";
import {
  requireUserWithAccount,
  workflowNotFoundResponse,
} from "@/app/api/workflows/_shared";
import { OnboardingPresentationActionSchema } from "@/contracts/onboarding";
import * as workflowsRepo from "@/repositories/workflows";
import * as onboardingRepo from "@/repositories/onboarding/userOnboardingStates";
import {
  recordOnboardingEvent,
  type OnboardingEventType,
} from "@/services/onboarding/onboardingEvents";

/** Presentation verbs that emit a funnel event (fail-open, content-free). */
const EVENT_BY_ACTION: Partial<Record<string, OnboardingEventType>> = {
  dismiss: "onboarding_dismissed",
  reopen: "onboarding_reopened",
  minimize: "onboarding_minimized",
  select_workflow: "onboarding_workflow_switched",
  video_watched: "onboarding_video_watched",
};

/**
 * POST /api/onboarding/presentation — the ONLY client-writable onboarding
 * surface (5.ONBOARD-1 Batch 1). Verb-based presentation mutations; the
 * server assigns every timestamp. `completed_at` / `completion_workflow_id` /
 * step state are NOT reachable from here — the `.strict()` discriminated
 * union rejects any body that tries (400), and the repository patch type has
 * no such fields.
 *
 * select_workflow: the target must be a non-deleted workflow in the CALLER'S
 * resolved account; anything else collapses to the standard no-leak 404
 * (`WORKFLOW_NOT_FOUND`) — no cross-account existence oracle.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = OnboardingPresentationActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }
  const action = parsed.data;

  try {
    const now = new Date().toISOString();
    let patch: onboardingRepo.PresentationPatch;
    switch (action.action) {
      case "dismiss":
        patch = { dismissedAt: now };
        break;
      case "reopen":
        patch = { dismissedAt: null, minimized: false };
        break;
      case "minimize":
        patch = { minimized: true };
        break;
      case "expand":
        patch = { minimized: false };
        break;
      case "video_watched":
        patch = { videoWatchedAt: now };
        break;
      case "celebrated":
        patch = { celebratedAt: now };
        break;
      case "select_workflow": {
        const wf = await workflowsRepo.getByIdServiceRole(action.workflowId);
        if (!wf || wf.state === "deleted" || wf.accountId !== auth.accountId) {
          return workflowNotFoundResponse();
        }
        patch = { selectedWorkflowId: wf.id };
        break;
      }
    }
    const record = await onboardingRepo.updatePresentationServiceRole(
      auth.userId,
      auth.accountId,
      patch,
    );
    const eventType = EVENT_BY_ACTION[action.action];
    if (eventType) {
      // Fire-and-forget — the recorder is fail-open and never blocks the verb.
      void recordOnboardingEvent({
        userId: auth.userId,
        accountId: auth.accountId,
        eventType,
        ...(action.action === "select_workflow"
          ? { workflowId: action.workflowId }
          : {}),
      });
    }
    return NextResponse.json({
      ok: true,
      presentation: {
        dismissed: record.dismissedAt !== null,
        minimized: record.minimized,
        videoWatched: record.videoWatchedAt !== null,
        celebrationPending:
          record.completedAt !== null && record.celebratedAt === null,
      },
      selectedWorkflowId: record.selectedWorkflowId,
    });
  } catch (err) {
    console.error(
      "[onboarding] presentation update failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json(
      { error: "ONBOARDING_UNAVAILABLE" },
      { status: 500 },
    );
  }
}
