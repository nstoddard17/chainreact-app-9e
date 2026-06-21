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
import { getGuidanceCredentialAvailability } from "@/services/integrations/guidanceCredentialAvailability";
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
  const { goalText, workflowId, recentTurns } = parsed.data;
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

  // 6. Run the advisory capability through the governance seam (audited). Read-only — no mutation.
  const result = await runWorkflowGuidanceIntakeCapability(
    {
      scope: { userId, accountId, ...(workflowId ? { workflowId } : {}) },
      goalText,
      ...(boundedRecentTurns && boundedRecentTurns.length ? { recentTurns: boundedRecentTurns } : {}),
      ...(definition ? { definition } : {}),
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

  // Deterministic, ephemeral preview derived ONLY from the already-capability-validated plan
  // (result.workflowPlan is non-null only after validateWorkflowPlan passed upstream). Pure transform
  // — no workflow create/mutate/apply/run, no draftDefinition write. Null when there is no valid plan.
  const previewDraft = result.workflowPlan ? planToDraftPreview(result.workflowPlan) : null;

  // Normalized advisory fields ONLY — no raw envelope, no raw usage, no prompt, no ids/secrets.
  return NextResponse.json({
    ok: true,
    guidanceText: result.guidanceText,
    source: result.source,
    workflowPlan: result.workflowPlan,
    previewDraft,
    ...(result.warnings ? { warnings: result.warnings } : {}),
  });
}
