import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { GuidanceConversationTurn } from "@/contracts/aiGuidance";

/**
 * Typed client for the limited anonymous AI-planning endpoint (REACT-LIVE-SKELETON-3). Used by the
 * `/start` rail for logged-out visitors. Never throws — failures resolve to `null` so the rail can
 * degrade to its sign-up CTA. Sends only the bounded goal + recent turns; the signed limit cookie is
 * carried automatically (same-origin fetch). No token/secret is ever handled client-side.
 */

export interface AnonymousGuidanceResponse {
  readonly guidanceText: string;
  readonly workflowPlan: WorkflowPlan | null;
  readonly previewDraft: DraftPreview | null;
  readonly warnings?: readonly string[];
  readonly remainingAnonymousAttempts: number;
  readonly limitReached: boolean;
}

export async function requestAnonymousGuidance(input: {
  goalText: string;
  recentTurns?: readonly GuidanceConversationTurn[];
}): Promise<AnonymousGuidanceResponse | null> {
  try {
    const res = await fetch("/api/ai/anonymous-workflow-guidance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goalText: input.goalText,
        ...(input.recentTurns && input.recentTurns.length ? { recentTurns: input.recentTurns } : {}),
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: boolean;
      guidanceText?: string;
      workflowPlan?: WorkflowPlan | null;
      previewDraft?: DraftPreview | null;
      warnings?: readonly string[];
      remainingAnonymousAttempts?: number;
      limitReached?: boolean;
    };
    if (!body || body.ok !== true) return null;
    return {
      guidanceText: body.guidanceText ?? "",
      workflowPlan: body.workflowPlan ?? null,
      previewDraft: body.previewDraft ?? null,
      ...(Array.isArray(body.warnings) && body.warnings.length ? { warnings: body.warnings } : {}),
      remainingAnonymousAttempts:
        typeof body.remainingAnonymousAttempts === "number" ? body.remainingAnonymousAttempts : 0,
      limitReached: body.limitReached === true,
    };
  } catch {
    return null;
  }
}
