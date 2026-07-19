import { NextResponse } from "next/server";
import { requireUserWithAccount } from "@/app/api/workflows/_shared";
import { CollaborationPresentationActionSchema } from "@/contracts/collaborationOnboarding";
import * as collabRepo from "@/repositories/onboarding/collaborationOnboardingStates";
import { resolveCurrentTrack } from "@/services/collaborationOnboarding/checklistState";
import {
  recordOnboardingEvent,
  type OnboardingEventType,
} from "@/services/onboarding/onboardingEvents";

/** Presentation verbs that emit a funnel event (fail-open, content-free). */
const EVENT_BY_ACTION: Partial<Record<string, OnboardingEventType>> = {
  dismiss: "collab_onboarding_dismissed",
  reopen: "collab_onboarding_reopened",
  minimize: "collab_onboarding_minimized",
};

/**
 * POST /api/onboarding/collaboration/presentation — the ONLY client-writable
 * collaboration-onboarding surface (5.ONBOARD-4).
 *
 * THE TRACK IS SERVER-DERIVED, NEVER SUPPLIED. The request body is a `.strict()`
 * discriminated union of five bare verbs with no track field, and the route
 * re-resolves the caller's current track from live account state via
 * `resolveCurrentTrack`. This is the load-bearing isolation rule: if a client
 * could name its own track it could dismiss — or read back the state of — a role
 * record that is not its own. A member's write can only ever land on their own
 * `team_member` row.
 *
 * `completed_at` is not reachable from here: the `.strict()` union rejects any
 * body that tries (400), and `CollaborationPresentationPatch` has no such field.
 * The route performs no owner-only action of any kind — it writes presentation
 * booleans for the caller's own row and nothing else.
 *
 * 404 when the account is not eligible or the caller has no role: there is no
 * collaboration checklist to mutate, and saying so distinguishes nothing a caller
 * could not already learn from the GET.
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
  const parsed = CollaborationPresentationActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }
  const action = parsed.data;

  try {
    const track = await resolveCurrentTrack({
      userId: auth.userId,
      accountId: auth.accountId,
    });
    if (track === null) {
      return NextResponse.json(
        { error: "COLLABORATION_ONBOARDING_UNAVAILABLE" },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    let patch: collabRepo.CollaborationPresentationPatch;
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
      case "celebrated":
        patch = { celebratedAt: now };
        break;
    }
    const record = await collabRepo.updatePresentationServiceRole(
      auth.userId,
      auth.accountId,
      track,
      patch,
    );
    const eventType = EVENT_BY_ACTION[action.action];
    if (eventType) {
      // Fire-and-forget — the recorder is fail-open and never blocks the verb.
      void recordOnboardingEvent({
        userId: auth.userId,
        accountId: auth.accountId,
        eventType,
        metadata: { user_role: track },
      });
    }
    return NextResponse.json({
      ok: true,
      track,
      presentation: {
        dismissed: record.dismissedAt !== null,
        minimized: record.minimized,
        celebrationPending:
          record.completedAt !== null && record.celebratedAt === null,
      },
    });
  } catch (err) {
    console.error(
      "[collab-onboarding] presentation update failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json(
      { error: "ONBOARDING_UNAVAILABLE" },
      { status: 500 },
    );
  }
}
