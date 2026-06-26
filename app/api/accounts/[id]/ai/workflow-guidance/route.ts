import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireUserWithAccount,
  loadWorkflowForMember,
  parseJsonBody,
  workflowNotFoundResponse,
} from "@/app/api/workflows/_shared";
import { aiCreditGate, type AiCreditGateOutcome } from "@/services/billing/aiCreditGate";
import { isHermesAgentEnabled, getHermesAgentGatewayConfig } from "@/services/ai-guidance/gateway/gatewayConfig";
import { reactAgentAuditRecorder } from "@/services/ai/reactAgent/audit";
import { runWorkflowGuidanceIntakeCapability } from "@/services/ai/reactAgent/capabilities/workflowGuidanceIntake";
import { planToDraftPreview } from "@/services/ai-guidance/preview/planToDraftPreview";
import { inferDeterministicPreviewPlan, detectCatalogGap } from "@/services/ai-guidance/fallback/inferDeterministicPreview";
import { inferDeterministicMutationOps } from "@/services/ai-guidance/fallback/inferDeterministicMutation";
import { proposeWorkflowMutation } from "@/services/ai-guidance/mutation/proposeWorkflowMutation";
import { runWorkflowEditFromModel } from "@/services/ai-guidance/mutation/runWorkflowEditFromModel";
import { summarizeProposedEdit } from "@/services/ai-guidance/mutation/summarizeProposedEdit";
import { buildEditableWorkflowGraph } from "@/services/ai-guidance/editableGraph/buildEditableWorkflowGraph";
import { buildCapabilityCatalogKeys } from "@/services/ai-guidance/capabilityCatalog";
import { getGuidanceCredentialAvailability } from "@/services/integrations/guidanceCredentialAvailability";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import {
  MAX_GUIDANCE_CONVERSATION_TURNS,
  MAX_GUIDANCE_CONVERSATION_TURN_TEXT,
} from "@/contracts/aiGuidance";
import * as accountsRepo from "@/repositories/accounts";

/**
 * POST /api/accounts/[id]/ai/workflow-guidance (HERMES-AGENT-CAPABILITY-ROUTE).
 *
 * The gated server boundary for the advisory `workflow_guidance_intake` capability. A signed-in
 * account member asks for help figuring out what workflow they need; ChainReact forwards a SAFE
 * prompt to the Hermes Agent (via the Render gateway) and returns advisory guidance / clarifying
 * questions. ChainReact stays the final validator/governor — this route NEVER creates, updates,
 * applies, runs, or deletes a workflow, and never calls a model vendor / Nous / the private Hermes
 * Agent directly (only the capability runner, which uses the gateway client).
 *
 * Gates, in order (mirrors the diagnose/qa route; nothing charges/runs before its guard passes):
 *   1. auth + account membership + freeze → `requireUserWithAccount(id)` (401 / 403). The accountId
 *      is the VALIDATED URL param — never trusted from the body.
 *   2. strict body { goalText, workflowId? } → 400. `.strict()` blocks a client-supplied accountId.
 *   3. optional workflowId → must belong to THIS account + caller is a member → else no-leak 404.
 *      The workflow's saved draft is passed as the OPTIONAL safe context (sanitized by the runner).
 *   4. Hermes availability (`HERMES_AGENT_ENABLED` + gateway config) BEFORE any charge → 503 when
 *      disabled/unconfigured (no credit charge, no network).
 *   5. `aiCreditGate` (feature `workflow_guidance`, fast tier) BEFORE the capability call → 402/403/503.
 *   6. `runWorkflowGuidanceIntakeCapability` through the `runAuthorizedCapability` governance seam,
 *      injecting the persistent audit recorder (one safe `react_agent_audit_events` row).
 *
 * Telemetry note: this route does NOT write an `ai_cost_events` model-call row — ChainReact makes no
 * direct model call here (the Hermes Agent does), so there is nothing to attribute. The credit GATE
 * provides metering; usage reconciliation is a future slice. No migration is required.
 *
 * Partial-preview fallback (HERMES-AGENT-DETERMINISTIC-SHAPE-FALLBACK): when Hermes returns guidance
 * text but NO valid plan, a narrow, model-free, catalog-validated shape inferer may still produce an
 * advisory plan for obvious supported patterns (e.g. "run manually → Slack channel message"). It runs
 * AFTER Hermes (Hermes' own validated plan always wins), calls no model/network, returns null for
 * anything ambiguous/unconfirmable, and its plan still passes `validateWorkflowPlan`.
 *
 * No-leak: the response carries only the normalized advisory fields (`guidanceText` / `source` /
 * `workflowPlan` / a non-applied `previewDraft` derived from the validated plan / safe `warnings`) —
 * never the raw provider envelope, raw usage, the prompt, the gateway token, account/workflow ids, or
 * any secret. The `previewDraft` is ephemeral + `notApplied: true` (HERMES-AGENT-DRAFT-PREVIEW): it is
 * NOT a persisted workflow definition and this route still never creates/mutates/applies/runs a
 * workflow. The audit row carries scope ids + registry enums only (no goal/guidance text).
 */

const MAX_GOAL_LENGTH = 2_000;

/**
 * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — optional, bounded, sanitized recent-conversation context.
 * Trust boundary: role allow-list (`user`/`assistant`), per-turn text bounded + trimmed, the array
 * capped at `MAX_GUIDANCE_CONVERSATION_TURNS` (extras keep the MOST RECENT via the route handler),
 * unknown per-turn fields STRIPPED (no `.strict()` on the turn so a forward-compatible client field is
 * ignored, not a 400). Optional → single-shot requests stay byte-identical.
 */
const ConversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z
    .string()
    .trim()
    .min(1)
    .max(MAX_GUIDANCE_CONVERSATION_TURN_TEXT),
});

const BodySchema = z
  .object({
    goalText: z.string().trim().min(1, "A goal description is required.").max(MAX_GOAL_LENGTH, `Goal is too long (max ${MAX_GOAL_LENGTH} characters).`),
    workflowId: z.string().trim().min(1).optional(),
    recentTurns: z.array(ConversationTurnSchema).max(MAX_GUIDANCE_CONVERSATION_TURNS).optional(),
    /**
     * HERMES-AGENT-WORKFLOW-EDITOR — the user's CURRENT local draft (stable ids + editable config +
     * edges) so React can propose a catalog-validated EDIT against what's on the canvas RIGHT NOW (incl.
     * locally-applied unsaved edits). The model never sees raw config (the prompt redacts secrets); the
     * patch pipeline validates every change. A forged draft can at worst yield an advisory preview the
     * user must still explicitly Apply.
     */
    currentDraft: WorkflowDefinitionSchema.optional(),
  })
  .strict();

/** Typed, no-leak credit-denial bodies (mirrors the diagnose/qa route). */
function aiCreditDenialResponse(gate: Extract<AiCreditGateOutcome, { ok: false }>): NextResponse {
  if (gate.reason === "account_frozen") {
    return NextResponse.json(
      { ok: false, code: "ACCOUNT_PENDING_DELETION", message: "This account is pending deletion." },
      { status: 403 },
    );
  }
  if (gate.reason === "gate_error") {
    return NextResponse.json(
      { ok: false, code: "AI_GATE_ERROR", message: "The AI assistant is temporarily unavailable. Please try again in a moment." },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { ok: false, code: "AI_CREDITS_EXHAUSTED", message: "You've used all AI credits for this billing period.", used: gate.used, limit: gate.limit },
    { status: 402 },
  );
}

/** Safe "guidance unavailable" response — disabled config or a provider/transport failure. */
function guidanceUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "GUIDANCE_UNAVAILABLE",
      message: "Workflow guidance isn't available right now. Please try again later.",
    },
    { status: 503 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // 1. Auth + account membership + freeze. accountId is the validated URL param (never from body).
  const auth = await requireUserWithAccount(id);
  if (!auth.ok) return auth.response;
  const { userId, accountId } = auth;

  // 2. Strict body — goalText required; a client-supplied accountId/extra field is rejected.
  const parsed = await parseJsonBody(request, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { goalText, workflowId, recentTurns, currentDraft } = parsed.data;
  // Belt-and-suspenders bound: keep only the MOST RECENT turns (schema already caps the count).
  const boundedRecentTurns = recentTurns?.slice(-MAX_GUIDANCE_CONVERSATION_TURNS);

  // 3. Optional workflow context — must belong to THIS account + caller is a member (else 404).
  let definition: import("@/contracts/workflow").WorkflowDefinition | undefined;
  let workflowCreatedByUserId: string | undefined;
  if (workflowId) {
    const wf = await loadWorkflowForMember(workflowId, userId);
    if (!wf.ok) return wf.response;
    if (wf.record.accountId !== accountId) return workflowNotFoundResponse(); // cross-account → no leak
    definition = wf.record.draftDefinition;
    // Creator id is used ONLY for the scope guard's own-vs-foreign private-connection comparison;
    // it is never sent to Hermes (the guard converts it to a generic notice, no owner identity).
    workflowCreatedByUserId = wf.record.createdByUserId;
  }

  // 4. Hermes availability BEFORE any charge — disabled/unconfigured → 503, no charge, no network.
  if (!isHermesAgentEnabled() || !getHermesAgentGatewayConfig()) {
    return guidanceUnavailableResponse();
  }

  // 5. Credit gate BEFORE the capability call. Metered as `workflow_guidance` (fast tier).
  const gate = await aiCreditGate({ accountId, feature: "workflow_guidance", plannedTier: "fast" });
  if (!gate.ok) return aiCreditDenialResponse(gate);

  // HERMES-AGENT-MEMORY-SCOPE-GUARD — resolve the account-scope summary for the context guard. Only
  // the account TYPE crosses the boundary (never the id/name). Credential-availability summaries are
  // not wired this slice (no existing safe source) — the guard simply omits them. Falls back to
  // "personal" if the account row can't be read (no teammates → no cross-member leak risk).
  const account = await accountsRepo.getById(accountId);
  const accountType = account?.type ?? "personal";

  // HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT — live, SANITIZED provider availability (account-
  // shared + the caller's OWN private connections). The service excludes other members' private
  // connections and any token/secret/id/owner; the scope guard re-sanitizes downstream. Degrades to
  // empty on read error (no credential context, never blocks guidance).
  const credentials = await getGuidanceCredentialAvailability({ accountId, userId });
  const sharedCredentialProviders = credentials.accountSharedProviders.map((p) => p.providerKey);
  const ownConnectionProviders = credentials.currentUserPrivateProviders.map((p) => p.providerKey);

  // HERMES-AGENT-WORKFLOW-EDITOR-LIVE — when the user is EDITING a non-empty local draft, build the SAFE
  // model-facing editable graph (opaque refs + safe editable config + version) via the editor privacy
  // boundary, and forward it + the public capability catalog to the model so it can propose a
  // `WorkflowPatch` referencing the canvas by opaque ref. The PRIVATE ref→realId map + version stay here
  // (server-only) for materialization + the stale guard; they NEVER cross to the model.
  const editing = !!currentDraft && currentDraft.nodes.length > 0;
  const builtEditableGraph = editing ? buildEditableWorkflowGraph(currentDraft!) : null;

  // 6. Run the advisory capability through the governance seam (audited). Read-only — no mutation.
  const result = await runWorkflowGuidanceIntakeCapability(
    {
      scope: { userId, accountId, ...(workflowId ? { workflowId } : {}) },
      goalText,
      ...(boundedRecentTurns && boundedRecentTurns.length ? { recentTurns: boundedRecentTurns } : {}),
      ...(definition ? { definition } : {}),
      ...(builtEditableGraph ? { editableGraph: builtEditableGraph.graph, capabilityCatalog: buildCapabilityCatalogKeys() } : {}),
      contextInputs: {
        account: { type: accountType },
        ...(workflowCreatedByUserId ? { workflowCreatedByUserId } : {}),
        ...(sharedCredentialProviders.length ? { sharedCredentialProviders } : {}),
        ...(ownConnectionProviders.length ? { ownConnectionProviders } : {}),
      },
    },
    { auditRecorder: reactAgentAuditRecorder },
  );

  if (!result.ok) {
    // PROVIDER_* / TIMEOUT / INVALID_RESPONSE / INVALID_SCOPE → safe unavailable. The runner already
    // failed closed; never surface the raw provider envelope or a raw error.
    return guidanceUnavailableResponse();
  }

  // HERMES-AGENT-WORKFLOW-EDITOR — when the user is EDITING an existing draft (a current draft was sent),
  // run the GENERAL mutation pipeline: prefer the model's proposed `WorkflowPatch` operations; else a
  // DEMOTED Slack↔email fallback that emits general operations (it asks WHICH step when ambiguous, never
  // guesses). proposeWorkflowMutation materializes ids, validates every node/edge/config against the
  // catalog atomically against the LOCAL draft, and returns the exact candidate end-state + preview.
  const connectedEmailProviders = [...sharedCredentialProviders, ...ownConnectionProviders].filter(
    (p) => p === "gmail" || p === "microsoft-outlook",
  );
  // DEMOTED, degraded-recovery fallback ONLY (never the primary mechanism): runs when the MODEL proposed
  // no patch. It emits real-id ops (it has the real draft), so it bypasses ref-resolution.
  const fallback = editing && !result.mutationOperations
    ? inferDeterministicMutationOps({ goalText, currentDraft: currentDraft!, connectedEmailProviders })
    : { kind: "none" as const };

  let workflowPlan = result.workflowPlan;
  let previewDraft = workflowPlan ? planToDraftPreview(workflowPlan) : null;
  let proposedDefinition: import("@/contracts/workflowDefinition").WorkflowDefinition | null = null;
  let baseGraphVersion: string | null = null;
  // HERMES-AGENT-WORKFLOW-EDITOR — for an editing turn, the rail message is OWNED by the route (a human
  // summary on success, a safe reason otherwise) so it can NEVER contradict the proposal state or leak
  // raw model JSON. `proposalWarnings` carries only non-blocking notes (cost / deletes-user-work).
  let editorGuidanceText: string | null = null;
  const proposalWarnings: string[] = [];
  // Safe copy when a mutation-shaped reply couldn't be turned into a usable, catalog-valid patch.
  const MALFORMED_EDIT_MESSAGE =
    "I couldn't preview that change. Tell me a bit more about what you'd like to change and I'll try again.";

  if (editing && result.mutationOperations && builtEditableGraph) {
    // PRIMARY model-driven path: opaque refs → stale guard → real ids → atomic catalog validation.
    const edit = runWorkflowEditFromModel({
      currentDraft: currentDraft!,
      editableGraph: builtEditableGraph,
      operations: result.mutationOperations,
      ...(result.mutationBaseVersion ? { modelBaseVersion: result.mutationBaseVersion } : {}),
    });
    if (edit.kind === "proposal") {
      proposedDefinition = edit.proposedDefinition;
      previewDraft = edit.previewDraft;
      workflowPlan = edit.workflowPlan;
      baseGraphVersion = edit.baseGraphVersion;
      editorGuidanceText = summarizeProposedEdit(currentDraft!, edit.proposedDefinition);
      proposalWarnings.push(...edit.warnings);
    } else if (edit.kind === "invalid" || edit.kind === "stale") {
      // Safe, actionable reason (changed/unknown step, unsupported capability) — never raw refs/JSON.
      editorGuidanceText = edit.message;
    }
  } else if (editing && fallback.kind === "ops") {
    // DEGRADED RECOVERY only: the model proposed no usable patch but the deterministic Slack↔email
    // fallback can. This also recovers a MALFORMED model edit when it maps to a supported shape.
    const proposal = proposeWorkflowMutation({ currentDraft: currentDraft!, operations: fallback.operations });
    if (proposal.kind === "proposal") {
      proposedDefinition = proposal.proposedDefinition;
      previewDraft = proposal.previewDraft;
      workflowPlan = proposal.workflowPlan;
      baseGraphVersion = builtEditableGraph?.version ?? null;
      editorGuidanceText = summarizeProposedEdit(currentDraft!, proposal.proposedDefinition);
      proposalWarnings.push(...proposal.warnings);
    } else if (proposal.kind === "invalid") {
      editorGuidanceText = proposal.message;
    }
  } else if (editing && result.mutationMalformed) {
    // A mutation-shaped reply we couldn't make usable AND the fallback couldn't recover → say so safely.
    editorGuidanceText = MALFORMED_EDIT_MESSAGE;
  } else if (editing && (fallback.kind === "needs_provider_choice" || fallback.kind === "needs_node_choice" || fallback.kind === "catalog_gap")) {
    // Clarification needed (e.g. Gmail vs Outlook) — ask ONLY the question; no patch, no preview.
    editorGuidanceText = fallback.message;
  }

  // NEW-workflow path (no draft to edit): the deterministic shape inferer + catalog-gap reason (REACT-
  // LIVE-SKELETON), unchanged. Only runs when we did NOT produce an edit proposal.
  if (!workflowPlan && !proposedDefinition && !editing) {
    workflowPlan = inferDeterministicPreviewPlan(goalText);
    previewDraft = workflowPlan ? planToDraftPreview(workflowPlan) : null;
  }
  const catalogGap = !editing && !workflowPlan && !proposedDefinition ? detectCatalogGap(goalText) : null;

  // The rail message: editing turns use the route-owned text; everything else uses the (already
  // JSON-stripped) model prose. Warnings carry only safe non-blocking notes.
  const guidanceText = editorGuidanceText ?? result.guidanceText;
  const warnings = [
    ...(result.warnings ?? []),
    ...proposalWarnings,
    ...(catalogGap ? [catalogGap.message] : []),
  ];

  // Normalized advisory fields ONLY — no raw envelope, no raw usage, no prompt, no secrets. The
  // proposedDefinition is the user's OWN draft + the validated change; Apply (client) is still explicit.
  return NextResponse.json({
    ok: true,
    guidanceText,
    source: result.source,
    workflowPlan,
    previewDraft,
    ...(proposedDefinition ? { proposedDefinition } : {}),
    // HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the draft version this proposal is pinned to, so the client can
    // refuse to Apply onto a canvas that changed since (one more stale guard at the explicit Apply click).
    ...(proposedDefinition && baseGraphVersion ? { baseGraphVersion } : {}),
    ...(warnings.length ? { warnings } : {}),
  });
}
