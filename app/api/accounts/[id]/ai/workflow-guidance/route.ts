import { randomUUID } from "node:crypto";
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
import {
  definitionUsesAdvancedBranching,
  isAdvancedBranchingTypeKey,
} from "@/core/workflows/advancedBranching";
import { resolveAdvancedBranchingEntitlement } from "@/services/billing/advancedBranchingEntitlement";
import { runWorkflowEditFromModel } from "@/services/ai-guidance/mutation/runWorkflowEditFromModel";
import { summarizeProposedEdit } from "@/services/ai-guidance/mutation/summarizeProposedEdit";
import { buildEditableWorkflowGraph } from "@/services/ai-guidance/editableGraph/buildEditableWorkflowGraph";
import { buildCapabilityCatalogKeys } from "@/services/ai-guidance/capabilityCatalog";
import { getGuidanceCredentialAvailability } from "@/services/integrations/guidanceCredentialAvailability";
import {
  selectOfficialTemplateRecommendationForRequest,
  buildOfficialTemplateMatchGuidanceText,
  buildManualFallbackNoticeText,
} from "@/services/workflows/officialTemplateMatching";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import {
  MAX_GUIDANCE_CONVERSATION_TURNS,
  MAX_GUIDANCE_CONVERSATION_TURN_TEXT,
  type GuidanceAttemptTelemetry,
} from "@/contracts/aiGuidance";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import {
  rebindSensitiveLiteralsDeep,
  rebindSensitiveLiteralsInText,
  tokenizeSensitiveLiterals,
  type SensitiveLiteralBinding,
} from "@/core/security/sensitiveLiterals";
import { sanitizePlanStepConfigs } from "@/services/ai-guidance/planConfig/sanitizeProposedConfig";
import { resolveProposedOptionValues } from "@/services/ai-guidance/planConfig/resolveProposedOptionValues";
import { prepareProposedOperations } from "@/services/ai-guidance/planConfig/prepareProposedOperations";
import { buildFieldSchemaLines, selectRelevantProviders } from "@/services/ai-guidance/promptFieldSchemas";
import {
  findProviderAmbiguity,
  type ProviderClarification,
} from "@/services/ai-guidance/providerSelection/providerSelectionGuard";
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

/**
 * REACT-AGENT-PRODUCTION-TIMEOUT-1 — serverless budget for this route.
 *
 * A complex builder turn legitimately takes tens of seconds inside the Hermes Agent (a ~11k-token
 * EDIT prompt through a reasoning model). Without an explicit budget the platform default decides
 * when to kill the function, and a kill produces an untyped 504 with no JSON body — the panel can
 * only render generic "unavailable" copy and nothing is left to diagnose. Declaring it keeps the
 * gateway's own abort (`HERMES_AGENT_TIMEOUT_MS`, default 45s, hard-capped at 55s in
 * `gatewayConfig.ts`) strictly inside the budget, so a slow brain always returns OUR typed 503.
 *
 * Next.js requires a static literal here, so it cannot import `GUIDANCE_ROUTE_MAX_DURATION_SECONDS`;
 * `tests/structure/guidance-route-timeout-budget.test.ts` keeps the two in lockstep.
 */
export const maxDuration = 60;

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

/**
 * REACT-AGENT-RETRY-BACKOFF-1 — the credit outcome as a SAFE enum for the failure log.
 *
 * The gate runs ONCE per user submission, before the brain call and outside the retry, so this also
 * documents the invariant in production output: whatever `attempts=` says, `creditOutcome=` describes
 * a single gate decision. Carries no counters/limits/account data — just which branch fired.
 */
function describeCreditOutcome(gate: AiCreditGateOutcome): string {
  if (!gate.ok) return `denied_${gate.reason}`;
  return "skipped" in gate ? `skipped_${gate.reason}` : "charged_once";
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

/**
 * REACT-AGENT-PRODUCTION-TIMEOUT-1 — the DISTINCT slow-brain failure.
 *
 * A timeout is not the same user situation as an outage: nothing is broken, the request was simply
 * too big/slow to finish in budget, and retrying or asking for a smaller change usually works. It
 * got the same opaque `GUIDANCE_UNAVAILABLE` copy as a dead gateway, which is why a 30s abort in
 * production read as "the agent is down". Still 503 (the request produced no guidance) and still
 * leak-free — a fixed code + fixed copy, no provider status, elapsed time, or internal detail.
 */
function guidanceTimeoutResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "GUIDANCE_TIMEOUT",
      message:
        "That took longer than the assistant could work on it. Try again, or ask for one smaller change at a time.",
    },
    { status: 503 },
  );
}

/**
 * REACT-AGENT-PRODUCTION-TIMEOUT-1 — safe server-side failure signal (Vercel logs only).
 *
 * Before this, every brain failure collapsed into one indistinguishable 503 and one
 * `reason: "exec_failed"` audit row, so production could not tell a timeout from a gateway outage
 * from a malformed reply — the whole reason this incident had to be diagnosed by stopwatch. Logs the
 * typed code, the elapsed time, and the request's SHAPE (which is what drives latency). Contains no
 * goal text, guidance text, prompt, token, account/user/workflow id, config, or provider payload.
 */
function logGuidanceFailure(info: {
  code: string;
  requestId: string;
  elapsedMs: number;
  editing: boolean;
  catalogKeys: number;
  fieldSchemaLines: number;
  recentTurns: number;
  telemetry?: GuidanceAttemptTelemetry | undefined;
  creditOutcome: string;
  httpStatus: number;
}): void {
  const t = info.telemetry;
  console.error(
    `[workflow-guidance] brain call failed requestId=${info.requestId} code=${info.code} ` +
      `httpStatus=${info.httpStatus} elapsedMs=${info.elapsedMs} ` +
      `attempts=${t?.attempts ?? 1} retried=${t?.retried ?? false} retryReason=${t?.retryReason ?? "none"} ` +
      `retrySkipped=${t?.retrySkippedReason ?? "none"} backoffMs=${t?.backoffMs ?? 0} ` +
      `remainingBudgetMs=${t?.remainingBudgetMsAtDecision ?? "n/a"} creditOutcome=${info.creditOutcome} ` +
      `editing=${info.editing} catalogKeys=${info.catalogKeys} fieldSchemaLines=${info.fieldSchemaLines} ` +
      `recentTurns=${info.recentTurns} — TIMEOUT means the request exceeded HERMES_AGENT_TIMEOUT_MS ` +
      "in ChainReact; PROVIDER_ERROR with a status_* reason means the Render gateway/agent failed first; " +
      "retrySkipped=insufficient_budget means a transient failure was NOT retried because too little time remained.",
  );
}

/**
 * REACT-AGENT-RETRY-BACKOFF-1 — a retry that SUCCEEDED is invisible to the user by design, so it has
 * to be visible here: without this line a flaky gateway looks perfectly healthy right up until it
 * stops recovering. Logged at `warn` (it is not an error — the user got their guidance).
 */
function logGuidanceRetryRecovered(info: { requestId: string; telemetry: GuidanceAttemptTelemetry }): void {
  console.warn(
    `[workflow-guidance] recovered after retry requestId=${info.requestId} ` +
      `attempts=${info.telemetry.attempts} retryReason=${info.telemetry.retryReason ?? "none"} ` +
      `backoffMs=${info.telemetry.backoffMs} elapsedMs=${info.telemetry.elapsedMs}`,
  );
}

/**
 * REACT-AGENT-RETRY-BACKOFF-1 — the caller went away mid-flight. Not a failure of ours: no retry, no
 * incident log, and a typed body nobody will read (the socket is gone) purely so the route always
 * returns something well-formed.
 */
function guidanceCancelledResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "GUIDANCE_CANCELLED", message: "The request was cancelled." },
    { status: 499 },
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

  // REACT-CONFIG-COVERAGE-1 — tokenize recipient-class literals (emails/phones) BEFORE anything
  // crosses to Hermes. The raw literal stays ONLY in this request-local binding list; the prompt
  // carries a typed placeholder (e.g. [[EMAIL_1]]) the model copies verbatim into config, and the
  // route rebinds the original value into the model's output below. Deterministic fallbacks and the
  // template matcher keep the RAW goal text — they are local and model-free.
  let literalBindings: readonly SensitiveLiteralBinding[] = [];
  const tokenizedGoal = tokenizeSensitiveLiterals(goalText);
  literalBindings = tokenizedGoal.bindings;
  const safeGoalText = tokenizedGoal.text;
  const safeRecentTurns = boundedRecentTurns?.map((turn) => {
    const tokenized = tokenizeSensitiveLiterals(turn.text, literalBindings);
    literalBindings = tokenized.bindings;
    return { role: turn.role, text: tokenized.text };
  });

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

  // 3b. REACT-AGENT-TEMPLATE-MATCH-4 — deterministic official-template DECISION, BEFORE the model path.
  // Only for a NEW-workflow "build this" request (no non-empty draft to edit). No LLM, no provider
  // call, no mutation. Degrades to "no match" on any read error (never blocks guidance).
  //
  // A template is only ever an OPTIONAL accelerator — never a requirement:
  //   - `strong_match` (right trigger, every named app present, requested outcome produced, no
  //     unrelated apps/side-effects — an exact single-provider template can qualify) → short-circuit
  //     with a SINGLE deterministic recommendation (capped, no menu of alternatives to
  //     reject). This returns BEFORE the Hermes-availability check AND the credit gate, so it skips the
  //     model call and consumes NO AI credits (the gate is where credits are deducted).
  //   - `weak_match` (only a partial/shared-app overlap) → do NOT recommend/force it. Note the manual
  //     fallback and fall through to normal node-by-node construction.
  //   - `no_match` → behavior unchanged (fall through to normal construction; no field added).
  const isNewWorkflowRequest = !(currentDraft && currentDraft.nodes.length > 0);
  let templateFallbackNotice: string | null = null;
  if (isNewWorkflowRequest) {
    try {
      const decision = await selectOfficialTemplateRecommendationForRequest({ requestText: goalText });
      if (decision.outcome === "strong_match" && decision.recommendation) {
        return NextResponse.json({
          ok: true,
          guidanceText: buildOfficialTemplateMatchGuidanceText([decision.recommendation]),
          source: "official_template_match",
          workflowPlan: null,
          previewDraft: null,
          officialTemplateMatches: [decision.recommendation],
          templateMatchOutcome: "strong_match",
        });
      }
      // A partial template existed but is NOT close enough — never force/repeat it; build manually.
      if (decision.outcome === "weak_match") {
        templateFallbackNotice = buildManualFallbackNoticeText();
      }
    } catch {
      templateFallbackNotice = null; // never let template matching break guidance
    }
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

  // REACT-CONFIG-COVERAGE-1 — narrowed, bounded field schemas for the relevant providers (public
  // registry metadata only), so the model can land user-supplied values in their canonical fields.
  const canvasCapabilityKeys = editing ? currentDraft!.nodes.map((n) => `${n.provider}:${n.type}`) : [];
  const fieldSchemaLines = buildFieldSchemaLines(
    selectRelevantProviders({
      texts: [goalText, ...(boundedRecentTurns?.map((t) => t.text) ?? [])],
      ...(canvasCapabilityKeys.length ? { canvasCapabilityKeys } : {}),
      connectedProviders: [...sharedCredentialProviders, ...ownConnectionProviders],
    }),
  );

  // 6. Run the advisory capability through the governance seam (audited). Read-only — no mutation.
  //
  // REACT-AGENT-RETRY-BACKOFF-1 — ONE logical id for this user submission. It is generated HERE, once,
  // AFTER the credit gate, and shared by both internal Hermes attempts. That ordering is what makes
  // "at most one AI credit per submission" structural rather than a convention: the gate is outside
  // the retry, so no retry path can reach it a second time.
  const requestId = randomUUID();
  const brainStartedAt = Date.now();
  const result = await runWorkflowGuidanceIntakeCapability(
    {
      scope: { userId, accountId, ...(workflowId ? { workflowId } : {}) },
      goalText: safeGoalText,
      ...(safeRecentTurns && safeRecentTurns.length ? { recentTurns: safeRecentTurns } : {}),
      ...(definition ? { definition } : {}),
      ...(fieldSchemaLines.length ? { fieldSchemaLines } : {}),
      ...(builtEditableGraph ? { editableGraph: builtEditableGraph.graph, capabilityCatalog: buildCapabilityCatalogKeys() } : {}),
      contextInputs: {
        account: { type: accountType },
        ...(workflowCreatedByUserId ? { workflowCreatedByUserId } : {}),
        ...(sharedCredentialProviders.length ? { sharedCredentialProviders } : {}),
        ...(ownConnectionProviders.length ? { ownConnectionProviders } : {}),
      },
    },
    {
      auditRecorder: reactAgentAuditRecorder,
      requestId,
      // REACT-AGENT-RETRY-BACKOFF-1 — the caller's cancellation propagates all the way to the fetch
      // AND to the retry backoff, so an abandoned request stops immediately instead of sleeping out
      // a delay and then firing a second model call nobody is waiting for.
      signal: request.signal,
    },
  );

  if (!result.ok) {
    // PROVIDER_* / TIMEOUT / CANCELLED / INVALID_RESPONSE / INVALID_SCOPE → safe typed failure. The
    // runner already failed closed; never surface the raw provider envelope or a raw error.
    // REACT-AGENT-PRODUCTION-TIMEOUT-1: a slow brain gets the distinct, actionable GUIDANCE_TIMEOUT
    // rather than the generic outage copy. REACT-AGENT-RETRY-BACKOFF-1: the log carries the attempt
    // counters so retry-exhaustion, a skipped retry, and a plain outage are all distinguishable.
    const cancelled = result.code === "CANCELLED";
    const status = cancelled ? 499 : 503;
    if (!cancelled) {
      logGuidanceFailure({
        code: result.code,
        requestId,
        httpStatus: status,
        elapsedMs: Date.now() - brainStartedAt,
        editing,
        catalogKeys: builtEditableGraph ? buildCapabilityCatalogKeys().length : 0,
        fieldSchemaLines: fieldSchemaLines.length,
        recentTurns: boundedRecentTurns?.length ?? 0,
        telemetry: result.attemptTelemetry,
        creditOutcome: describeCreditOutcome(gate),
      });
    }
    if (cancelled) return guidanceCancelledResponse();
    return result.code === "TIMEOUT" ? guidanceTimeoutResponse() : guidanceUnavailableResponse();
  }

  // A silent recovery still needs a trace — otherwise a degrading gateway looks perfectly healthy.
  if (result.attemptTelemetry?.retried) {
    logGuidanceRetryRecovered({ requestId, telemetry: result.attemptTelemetry });
  }

  // REACT-CONFIG-COVERAGE-1 — rebind sensitive-literal placeholders back to the user's exact values
  // in everything the model returned (display text, plan-step config, patch operations). Then run
  // the metadata-driven config pipeline: sanitize against the node's real FieldMeta and verify /
  // label-map dynamic option values through the canonical resolvers. A supplied-but-unusable value
  // becomes a targeted setup input (requiredInputs / a safe warning) — never a silent drop.
  const reboundGuidanceText = rebindSensitiveLiteralsInText(result.guidanceText, literalBindings);
  const reboundMutationOperations = result.mutationOperations
    ? rebindSensitiveLiteralsDeep(result.mutationOperations, literalBindings)
    : undefined;
  const configWarnings: string[] = [];

  /** Sanitize + dynamic-resolve one plan's step configs. Field KEYS only ever reach warnings. */
  async function preparePlanConfigs(plan: WorkflowPlan): Promise<WorkflowPlan> {
    const rebound = rebindSensitiveLiteralsDeep(plan, literalBindings);
    const sanitized = sanitizePlanStepConfigs(rebound).plan;
    const targets = sanitized.steps
      .filter(
        (s): s is typeof s & { config: Readonly<Record<string, unknown>> } =>
          (s.role === "trigger" || s.role === "action") && !!s.config && Object.keys(s.config).length > 0,
      )
      .map((s) => ({
        ref: s.ref,
        kind: s.role as "trigger" | "action",
        capabilityKey: `${s.provider}:${s.type}`,
        config: s.config,
      }));
    if (targets.length === 0) return sanitized;
    const resolved = await resolveProposedOptionValues({
      userId,
      ...(workflowId ? { workflowId } : {}),
      targets,
    });
    const byRef = new Map(resolved.map((r) => [r.ref, r]));
    return {
      ...sanitized,
      steps: sanitized.steps.map((step) => {
        const r = byRef.get(step.ref);
        if (!r) return step;
        for (const field of r.deferredFields) {
          configWarnings.push(`I couldn't set '${field}' automatically — pick it in the step's setup.`);
        }
        const requiredInputs = [...new Set([...(step.requiredInputs ?? []), ...r.deferredFields])];
        const { config: _config, ...rest } = step;
        return {
          ...rest,
          ...(requiredInputs.length > 0 ? { requiredInputs } : {}),
          ...(Object.keys(r.config).length > 0 ? { config: r.config } : {}),
        };
      }),
    };
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
  const fallback = editing && !reboundMutationOperations
    ? inferDeterministicMutationOps({ goalText, currentDraft: currentDraft!, connectedEmailProviders })
    : { kind: "none" as const };

  // REACT-PROVIDER-AMBIGUITY-1/-2 — the provider-selection guard's shared context: the user's words
  // (all turns), providers already on their canvas, and connected providers. See the decision table
  // in `providerSelectionGuard.ts` — a capability match never authorizes inventing a provider, and
  // `connectedProviders` informs only the clarification COPY (connection ≠ intent).
  const providerGuardCtx = {
    texts: [goalText, ...(boundedRecentTurns?.map((t) => t.text) ?? [])],
    canvasProviders: editing ? currentDraft!.nodes.map((n) => n.provider) : [],
    connectedProviders: [...sharedCredentialProviders, ...ownConnectionProviders],
  };
  let providerClarification: ProviderClarification | null = null;

  let workflowPlan = result.workflowPlan ? await preparePlanConfigs(result.workflowPlan) : null;
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

  if (editing && reboundMutationOperations && builtEditableGraph) {
    // REACT-CONFIG-COVERAGE-1 — sanitize config-bearing ops against registry metadata + verify /
    // label-map dynamic option values through the canonical resolvers BEFORE the edit pipeline.
    // Unusable supplied values are removed and surfaced as targeted setup notes (never silently).
    const prepared = await prepareProposedOperations({
      operations: reboundMutationOperations,
      nodeContextForRef: (nodeRef) => {
        const realId = builtEditableGraph.refMap.get(nodeRef) ?? nodeRef;
        const node = currentDraft!.nodes.find((n) => n.id === realId);
        if (!node) return null;
        return {
          kind: node.kind === "trigger" ? "trigger" : "action",
          capabilityKey: `${node.provider}:${node.type}`,
          existingConfig: node.config ?? {},
        };
      },
      userId,
      ...(workflowId ? { workflowId } : {}),
    });
    for (const { field } of prepared.deferredFields) {
      configWarnings.push(`I couldn't set '${field}' automatically — pick it in the step's setup.`);
    }

    // REACT-PROVIDER-AMBIGUITY-1 — every node the edit ADDS (addNode / replaceTrigger) must carry a
    // JUSTIFIED provider (explicit mention / canvas / sole candidate / documented connected
    // narrowing). An unjustified choice becomes a targeted question INSTEAD of a proposal — an
    // existing node's provider is never silently swapped for an invented one. updateNodeConfig on
    // existing nodes carries no provider decision and passes through.
    const addedNodes = prepared.operations.flatMap((op) =>
      op.op === "addNode" || op.op === "replaceTrigger"
        ? [
            {
              provider: op.node.provider,
              type: op.node.type,
              kind: (op.node.kind === "trigger" ? "trigger" : "action") as "trigger" | "action",
            },
          ]
        : [],
    );
    const editAmbiguity = findProviderAmbiguity(addedNodes, providerGuardCtx);
    if (editAmbiguity.clarification) {
      providerClarification = editAmbiguity.clarification;
      editorGuidanceText = editAmbiguity.clarification.question;
    }

    // PRIMARY model-driven path: opaque refs → stale guard → real ids → atomic catalog validation.
    // Skipped entirely when the provider choice needs clarification (no proposal is previewed).
    const edit = providerClarification
      ? null
      : runWorkflowEditFromModel({
          currentDraft: currentDraft!,
          editableGraph: builtEditableGraph,
          operations: prepared.operations,
          ...(result.mutationBaseVersion ? { modelBaseVersion: result.mutationBaseVersion } : {}),
        });
    if (edit && edit.kind === "proposal") {
      proposedDefinition = edit.proposedDefinition;
      previewDraft = edit.previewDraft;
      workflowPlan = edit.workflowPlan;
      baseGraphVersion = edit.baseGraphVersion;
      editorGuidanceText = summarizeProposedEdit(currentDraft!, edit.proposedDefinition);
      proposalWarnings.push(...edit.warnings);
    } else if (edit && (edit.kind === "invalid" || edit.kind === "stale")) {
      // Safe, actionable reason (changed/unknown step, unsupported capability) — never raw refs/JSON.
      editorGuidanceText = edit.message;
    }
  } else if (editing && fallback.kind === "ops") {
    // DEGRADED RECOVERY only: the model proposed no usable patch but the deterministic Slack↔email
    // fallback can. This also recovers a MALFORMED model edit when it maps to a supported shape.
    //
    // REACT-PROVIDER-AMBIGUITY-2 — the fallback's own resolver no longer reads connection state, but
    // run its ADDED nodes through the SAME guard anyway (defense in depth): one decision table
    // governs every path that can introduce a provider, whatever the source of the operations.
    const fallbackAdded = fallback.operations.flatMap((op) =>
      op.op === "addNode" || op.op === "replaceTrigger"
        ? [
            {
              provider: op.node.provider,
              type: op.node.type,
              kind: (op.node.kind === "trigger" ? "trigger" : "action") as "trigger" | "action",
            },
          ]
        : [],
    );
    const fallbackAmbiguity = findProviderAmbiguity(fallbackAdded, providerGuardCtx);
    const proposal = fallbackAmbiguity.clarification
      ? ({ kind: "clarify" } as const)
      : proposeWorkflowMutation({ currentDraft: currentDraft!, operations: fallback.operations });
    if (fallbackAmbiguity.clarification) {
      providerClarification = fallbackAmbiguity.clarification;
      editorGuidanceText = fallbackAmbiguity.clarification.question;
    } else if (proposal.kind === "proposal") {
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

  // REACT-PROVIDER-AMBIGUITY-1 — NEW-workflow provider guard: every plan step's provider must be
  // justified (decision table in providerSelectionGuard.ts). "Email" names a capability, not Gmail:
  // an unjustified choice drops the plan/preview and asks ONE targeted provider question instead.
  // The user's constraints (incl. tokenized literals) survive via the conversation — the follow-up
  // turn re-plans with the chosen provider and the same values, nothing needs re-typing.
  if (!editing && workflowPlan && !proposedDefinition) {
    const planNodes = workflowPlan.steps
      .filter((s) => s.role === "trigger" || s.role === "action")
      .map((s) => ({ provider: s.provider, type: s.type, kind: s.role as "trigger" | "action" }));
    const planAmbiguity = findProviderAmbiguity(planNodes, providerGuardCtx);
    if (planAmbiguity.clarification) {
      providerClarification = planAmbiguity.clarification;
      workflowPlan = null;
      previewDraft = null;
    }
  }

  const catalogGap = !editing && !workflowPlan && !proposedDefinition && !providerClarification ? detectCatalogGap(goalText) : null;

  // BRANCH-ENT-1 C5 — plan-feature guard for AI OUTPUT. If the turn produced a
  // plan/preview/proposal that uses advanced branching (If/Then Condition /
  // Router) and THIS account's current billing doesn't entitle it, the route
  // drops the plan/proposal and answers with a grounded upgrade explanation
  // instead — the agent never hands a Free account a branching graph, never
  // silently rewrites it linear, and never claims a change was made. (The
  // shared save gate + engine gate remain the enforcement backstops if any
  // other path tries to persist or run one.)
  const aiOutputUsesBranching =
    (proposedDefinition !== null && definitionUsesAdvancedBranching(proposedDefinition)) ||
    (workflowPlan?.steps.some((s) =>
      isAdvancedBranchingTypeKey(`${s.provider}:${s.type}`),
    ) ??
      false);
  if (aiOutputUsesBranching) {
    const branchingEntitlement = await resolveAdvancedBranchingEntitlement(accountId);
    if (!branchingEntitlement.entitled) {
      workflowPlan = null;
      previewDraft = null;
      proposedDefinition = null;
      baseGraphVersion = null;
      editorGuidanceText =
        "This workflow needs If/Else branching, which is available on Pro and higher. You can upgrade your plan, or I can help build a simpler linear version if one fits your goal.";
    }
  }

  // The rail message: editing turns use the route-owned text; a provider clarification OWNS the
  // message (the model's prose may assume a provider we refused); everything else uses the (already
  // JSON-stripped) model prose. Warnings carry only safe non-blocking notes.
  const guidanceText = editorGuidanceText ?? (providerClarification ? providerClarification.question : reboundGuidanceText);
  const warnings = [
    ...(result.warnings ?? []),
    ...proposalWarnings,
    ...[...new Set(configWarnings)],
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
    // REACT-PROVIDER-AMBIGUITY-1 — the targeted provider question (stable ids + display names).
    // Present ⇒ no plan/preview/proposal was committed this turn.
    ...(providerClarification ? { providerClarification } : {}),
    ...(warnings.length ? { warnings } : {}),
    // REACT-AGENT-TEMPLATE-MATCH-4 — a partial (weak) template match was found but deliberately NOT
    // recommended; the agent is building manually. Surface the brief, safe fallback notice so the UI
    // can explain why no template card appeared. Omitted for strong (short-circuited) / no match.
    ...(templateFallbackNotice
      ? { templateFallbackNotice, templateMatchOutcome: "weak_match" }
      : {}),
  });
}
