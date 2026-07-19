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
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { GuidanceConversationTurn, GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";
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
      /**
       * HERMES-AGENT-WORKFLOW-EDITOR — for a general EDIT proposal, the exact catalog-validated end-state
       * graph (a `WorkflowPatch` validated against the user's current local draft). When present, Apply
       * REPLACES the local draft with this; the `previewDraft` renders it. Null for new-workflow
       * skeletons (additive) and prose-only replies. Never persisted by this response.
       */
      proposedDefinition?: WorkflowDefinition | null;
      /**
       * HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the local-draft version the `proposedDefinition` was validated
       * against. Apply re-checks the LIVE draft against this and refuses to replace a canvas that drifted
       * since (the user kept editing). Present only alongside a `proposedDefinition`.
       */
      baseGraphVersion?: string;
      /**
       * REACT-PROVIDER-AMBIGUITY-1/-2 — the targeted provider question when the request named a
       * capability ("email") that more than one REGISTERED provider implements and none was
       * justified (explicit mention / existing canvas node / sole registered candidate). Present ⇒
       * NO plan/preview/proposal was committed this turn; `guidanceText` carries the question.
       * `options` pair stable provider ids with user-facing display names; `isConnected` is
       * DISPLAY EMPHASIS ONLY — the UI must never preselect or auto-commit a connected option
       * (connection is availability, not the user's choice).
       */
      providerClarification?: {
        readonly kind: "trigger" | "action";
        readonly category: string;
        readonly options: readonly {
          readonly providerId: string;
          readonly label: string;
          readonly isConnected: boolean;
        }[];
        readonly question: string;
      };
      warnings?: readonly string[];
      /**
       * REACT-AGENT-TEMPLATE-MATCH-4 — a deterministic, SAFE official-template recommendation for a
       * "build this workflow" request. Present ONLY for a STRONG match (`source ===
       * "official_template_match"`, `templateMatchOutcome === "strong_match"`, no model call / no AI
       * credit). It is capped at a SINGLE recommendation — never a menu of partial alternatives.
       * Recommendation-only — rendering it never creates/forks/uses a template; it carries no raw
       * definition/config/{{...}}. Absent for weak/no matches (the agent builds the workflow manually).
       */
      officialTemplateMatches?: readonly GuidanceOfficialTemplateMatch[];
      /**
       * REACT-AGENT-TEMPLATE-MATCH-4 — the explicit three-way decision. `strong_match` accompanies a
       * recommendation; `weak_match` means a partial template was found but deliberately NOT recommended
       * (the agent is building manually). Absent for `no_match` / editing turns.
       */
      templateMatchOutcome?: "strong_match" | "weak_match";
      /**
       * REACT-AGENT-TEMPLATE-MATCH-4 — brief, safe copy for the manual-fallback path: a partial template
       * matched but wasn't close enough, so the agent builds directly instead of forcing it. Present
       * only alongside `templateMatchOutcome === "weak_match"`.
       */
      templateFallbackNotice?: string;
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
   * HERMES-AGENT-WORKFLOW-EDITOR — the user's CURRENT local draft (nodes with STABLE ids + editable
   * config + edges) so React can act as a conversational editor: resolve references ("change it",
   * "remove that Slack step"), propose a `WorkflowPatch`, and have ChainReact validate + preview it
   * against what's on the canvas RIGHT NOW (incl. locally-applied unsaved edits). The SERVER redacts
   * secret-shaped config before the model ever sees it; the raw draft is the user's own data over the
   * authenticated channel. Omitted when the builder has no graph wiring (dashboard single-shot).
   */
  readonly currentDraft?: WorkflowDefinition;
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
      ...(input.currentDraft && input.currentDraft.nodes.length > 0 ? { currentDraft: input.currentDraft } : {}),
    },
  );
}
