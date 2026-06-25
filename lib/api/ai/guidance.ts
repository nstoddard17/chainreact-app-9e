/**
 * Typed client for the Hermes Agent workflow-guidance route (HERMES-AGENT-GUIDANCE-UI).
 *
 * Browser code calls THIS helper — never `fetch()` from a component, and NEVER the Render AI
 * gateway / a model vendor / the private Hermes Agent directly. The only thing this touches is the
 * ChainReact server route `POST /api/accounts/[id]/ai/workflow-guidance`, which owns auth, account
 * membership, the AI-credit gate, config gating, audit, and the safe (token-free) response.
 *
 * Advisory only: the response carries `guidanceText` (+ a safe `source` / `warnings`), an OPTIONAL
 * capability-validated `workflowPlan` (HERMES-AGENT-PLAN-EXTRACTION), and an OPTIONAL non-applied
 * `previewDraft` derived deterministically from that validated plan (HERMES-AGENT-DRAFT-PREVIEW). Both
 * are `notApplied: true` and rendered REVIEW/PREVIEW-ONLY — no create/apply/add/run. The preview is
 * NOT a persisted workflow definition. No secret, provider envelope, or token ever crosses this
 * boundary.
 */

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { GuidanceConversationTurn } from "@/contracts/aiGuidance";
import { postStructured } from "./shared";

export type WorkflowGuidanceResponse =
  | {
      ok: true;
      guidanceText: string;
      source: string;
      /** Capability-validated advisory plan, or null. Review-only — never applied by this response. */
      workflowPlan: WorkflowPlan | null;
      /** Ephemeral, non-applied preview derived from the validated plan, or null. Never persisted. */
      previewDraft: DraftPreview | null;
      warnings?: readonly string[];
    }
  | { ok: false; code: string; message: string };

export interface RequestWorkflowGuidanceInput {
  /** The account whose guidance is requested. Comes from server/router context — never arbitrary. */
  readonly accountId: string;
  /** The user's own automation goal text (the latest turn). */
  readonly goalText: string;
  /** Optional builder-context workflow id; verified server-side to belong to the account. */
  readonly workflowId?: string;
  /**
   * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — optional session-scoped recent conversation (the builder
   * rail's prior user/assistant turns) so a follow-up reads in context. PLAIN TEXT only — never config,
   * secrets, tokens, ids, or raw workflow JSON. The server re-bounds/sanitizes it; omitted on the first
   * turn so single-shot requests are byte-identical to before.
   */
  readonly recentTurns?: readonly GuidanceConversationTurn[];
  /**
   * HERMES-AGENT-MUTATION-PREVIEW — the CURRENT draft graph SHAPE (kind/provider/type only) so a
   * "change it to email" style request can be previewed against what's on the canvas RIGHT NOW, incl.
   * locally-applied unsaved edits. SHAPE ONLY — never config/values/ids/labels/secrets. Omitted when the
   * builder has no graph wiring (e.g. dashboard single-shot) → request is byte-identical to before.
   */
  readonly currentGraph?: readonly { readonly kind: string; readonly provider: string; readonly type: string }[];
}

/**
 * Request advisory workflow guidance. Returns the structured `{ ok, ... }` body for handled outcomes
 * (success and `ok:false` denials like credits/unavailable); throws `AiApiError` for transport-level
 * failures (401 / 400 / 500). Callers render only `guidanceText` and map failures to safe copy.
 */
export async function requestWorkflowGuidance(
  input: RequestWorkflowGuidanceInput,
): Promise<WorkflowGuidanceResponse> {
  return postStructured<WorkflowGuidanceResponse>(
    `/api/accounts/${encodeURIComponent(input.accountId)}/ai/workflow-guidance`,
    {
      goalText: input.goalText,
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      ...(input.recentTurns && input.recentTurns.length > 0 ? { recentTurns: input.recentTurns } : {}),
      ...(input.currentGraph && input.currentGraph.length > 0 ? { currentGraph: input.currentGraph } : {}),
    },
  );
}
