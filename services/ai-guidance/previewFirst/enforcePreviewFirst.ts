/**
 * Preview-first enforcement ORCHESTRATION (REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1;
 * extracted from the workflow-guidance route in -RELEASE-CLOSEOUT-1 — a pure code move, no
 * behavior change, so the route stays a thin HTTP boundary).
 *
 * Owns the full no-plan decision for a NEW-workflow guidance turn:
 *
 *   initial reply has a plan (or edit ops), or the turn is an edit → accept unchanged
 *   no plan + classifier says genuinely ambiguous                 → accept (clarification stands)
 *   no plan + preview expected + enough budget                    → ONE structured repair call
 *   repair returns a plan                                         → accept the repaired reply
 *   repair returns no plan / fails / budget insufficient          → generic registry-driven
 *                                                                   fallback (REACT-AGENT-PLAN-
 *                                                                   GENERATION-REGRESSION-AUDIT-1):
 *                                                                   unambiguous named-provider chain
 *                                                                   → accept a skeletal plan
 *   fallback declines (any ambiguity)                             → `plan_missing` (the route maps
 *                                                                   it to the typed retryable
 *                                                                   PREVIEW_PLAN_MISSING response)
 *
 * Invariants preserved exactly as shipped in bba2d144c:
 *   - at most 1 initial + 1 repair call, never a loop;
 *   - the repair reuses the submission's logical requestId and the caller's abort signal;
 *   - NO second AI-credit charge (the gate runs in the route BEFORE the initial call; nothing here
 *     can reach it) and NO second governance row (the repair is an internal continuation, like the
 *     gateway's transport retry — represented in the observability line instead);
 *   - the repair shares the route's total time budget: it is SKIPPED, not started, when less than
 *     `MIN_REPAIR_BUDGET_MS` remains, and a non-finite budget fails CLOSED (a typed, retryable
 *     failure beats starting a call that may outlive the function and die as an untyped 504);
 *   - one safe observability line per no-plan turn — enums/counts/booleans only, never the prompt,
 *     the model's text, workflow values, or identity.
 *
 * The gateway's network retry (REACT-AGENT-RETRY-BACKOFF-1) is a SEPARATE, lower layer: it retries
 * transport failures inside one capability call; this module decides whether to make a second
 * capability call because the first SUCCEEDED with the wrong shape.
 */

import type { AccountType } from "@/contracts/accounts";
import { PREVIEW_LEAD_IN } from "@/core/ai/previewLeadInCopy";
import type { GuidanceConversationTurn } from "@/contracts/aiGuidance";
import {
  MAX_GUIDANCE_CONVERSATION_TURNS,
  MAX_GUIDANCE_CONVERSATION_TURN_TEXT,
} from "@/contracts/aiGuidance";
import type { WorkflowDefinition } from "@/contracts/workflow";
import {
  runWorkflowGuidanceIntakeCapability,
  type WorkflowGuidanceIntakeResult,
} from "@/services/ai/reactAgent/capabilities/workflowGuidanceIntake";
import type { ReactAgentScope } from "@/services/ai/reactAgent/types";
import {
  GUIDANCE_ROUTE_MAX_DURATION_SECONDS,
  ROUTE_RESPONSE_MARGIN_MS,
} from "@/services/ai-guidance/gateway/gatewayConfig";
import { inferNamedProviderChainPlan } from "../fallback/inferNamedProviderChainPlan";
import {
  buildHonestCapabilityCopy,
  findCapabilityContradiction,
} from "./capabilityContradiction";
import {
  classifyPreviewFirst,
  buildPreviewFirstRepairGoal,
  MIN_REPAIR_BUDGET_MS,
} from "./classifyPreviewFirst";

/**
 * Lead-in shown with a deterministic-fallback skeleton (REACT-AGENT-PLAN-GENERATION-REGRESSION-
 * AUDIT-1). The model's own prose was a questionnaire we are deliberately NOT surfacing, so the
 * fallback plan needs honest, fixed copy of its own. No model text, no values.
 * REACT-AGENT-PREVIEW-COPY-CLEANUP-1 — the shared preview lead-in: from the user's point of view
 * this IS the same moment as any other successful sketch, so it must describe the same journey.
 */
const FALLBACK_PLAN_LEAD_IN = PREVIEW_LEAD_IN;

/**
 * Safety margin kept between the repair's deadline and the platform's hard kill. Now the shared
 * budget-partition constant (REACT-AGENT-TIMEOUT-FALLBACK-RELIABILITY-1) so one number governs
 * every reserve calculation.
 */
const ROUTE_BUDGET_SAFETY_MARGIN_MS = ROUTE_RESPONSE_MARGIN_MS;

export interface EnforcePreviewFirstInput {
  /** The initial guidance reply (already `ok: true`; the route handles failures before this). */
  readonly initialResult: WorkflowGuidanceIntakeResult & { readonly ok: true };
  /** True when the turn edits an existing non-empty draft (edit pipeline owns that path). */
  readonly editing: boolean;
  /** The TOKENIZED goal text (sensitive literals already replaced — nothing new can leak). */
  readonly safeGoalText: string;
  /** `Date.now()` captured just before the initial call — the shared budget's anchor. */
  readonly brainStartedAt: number;
  /** The submission's ONE logical request id — reused by the repair call. */
  readonly requestId: string;
  /** The incoming request's cancellation signal — aborts the repair with the caller. */
  readonly signal?: AbortSignal;
  // ── Repair-call construction (the exact inputs the initial call used) ──
  readonly scope: ReactAgentScope;
  readonly safeRecentTurns?: readonly GuidanceConversationTurn[];
  readonly definition?: WorkflowDefinition;
  readonly fieldSchemaLines: readonly string[];
  readonly outputSchemaLines: readonly string[];
  /** REACT-AGENT-LATENCY-AND-PROMPT-SIZE-1 — the repair reuses the SAME Stage-A compact catalog. */
  readonly compactCapabilityLines?: readonly string[];
  readonly otherProvidersLine?: string;
  readonly contextInputs: {
    readonly account: { readonly type: AccountType };
    readonly workflowCreatedByUserId?: string;
    readonly sharedCredentialProviders?: readonly string[];
    readonly ownConnectionProviders?: readonly string[];
  };
}

export type EnforcePreviewFirstOutcome =
  /** Continue the normal pipeline with `result` (the initial reply, or the repaired one). */
  | {
      readonly kind: "accept";
      readonly result: WorkflowGuidanceIntakeResult & { readonly ok: true };
      /** REACT-AGENT-LATENCY-AND-PROMPT-SIZE-1 — which attempt produced the accepted reply (telemetry). */
      readonly via: "initial" | "repair" | "fallback";
    }
  /** Plan expected, two attempts produced none — the route returns the typed retryable failure. */
  | { readonly kind: "plan_missing" };

/**
 * One safe observability line per no-plan turn (REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1).
 * Fixed keys; enums/counts/booleans only. Never the goal text, model text, provider names beyond
 * safe registry ids, workflow values, or identity.
 */
function logPreviewFirstDecision(info: {
  requestId: string;
  initialHadPlan: boolean;
  previewFirstClassification: string;
  namedProviderCount: number;
  repairAttempted: boolean;
  repairSkippedReason?: "insufficient_budget" | undefined;
  repairHadPlan?: boolean | undefined;
  clarificationAllowed: boolean;
  finalOutcome: "plan" | "clarification" | "deterministic_fallback_plan" | "preview_plan_missing";
  elapsedMs: number;
  // REACT-AGENT-PLAN-GENERATION-REGRESSION-AUDIT-1 — typed plan-stage codes + safe counts, so a
  // no-plan turn says WHERE the plan died (model wrote no JSON vs parse vs schema vs capability).
  initialPlanStage?: string | undefined;
  initialResponseChars?: number | undefined;
  initialTruncationSuspected?: boolean | undefined;
  repairPlanStage?: string | undefined;
  repairResponseChars?: number | undefined;
  /** Public `provider:type` ids the model invented (registry-rejected). Never user data. */
  invalidCapabilityKeys?: readonly string[] | undefined;
}): void {
  console.info(
    `[workflow-guidance] preview_first requestId=${info.requestId} initialHadPlan=${info.initialHadPlan} ` +
      `classification=${info.previewFirstClassification} namedProviders=${info.namedProviderCount} ` +
      `initialPlanStage=${info.initialPlanStage ?? "n/a"} initialResponseChars=${info.initialResponseChars ?? "n/a"} ` +
      `initialTruncationSuspected=${info.initialTruncationSuspected ?? "n/a"} ` +
      `repairAttempted=${info.repairAttempted} repairSkipped=${info.repairSkippedReason ?? "n/a"} ` +
      `repairHadPlan=${info.repairHadPlan ?? "n/a"} ` +
      `repairPlanStage=${info.repairPlanStage ?? "n/a"} repairResponseChars=${info.repairResponseChars ?? "n/a"} ` +
      `invalidCapabilityKeys=${info.invalidCapabilityKeys?.join("|") ?? "none"} ` +
      `clarificationAllowed=${info.clarificationAllowed} ` +
      `finalOutcome=${info.finalOutcome} elapsedMs=${info.elapsedMs}`,
  );
}

/**
 * REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — one safe line whenever a model reply contradicted
 * the registry and was repaired. Enums + safe registry id only — never the model's text.
 */
function logCapabilityContradiction(info: {
  requestId: string;
  providerId: string;
  handling: "honest_copy" | "plan_lead_in";
}): void {
  console.warn(
    `[workflow-guidance] capability_contradiction requestId=${info.requestId} ` +
      `provider=${info.providerId} handling=${info.handling} — the model denied a registered ` +
      "capability; the reply was repaired with application-owned wording.",
  );
}

/**
 * Apply preview-first enforcement to an initial guidance reply. See the module header for the
 * decision table and preserved invariants.
 */
export async function enforcePreviewFirst(
  input: EnforcePreviewFirstInput,
): Promise<EnforcePreviewFirstOutcome> {
  const { initialResult, editing, safeGoalText, brainStartedAt, requestId } = input;

  // REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — the USER's own texts across this conversation.
  // Conversation-aware classification (a clarification answer like "gmail" is judged with the turns
  // that gave it meaning), and the scope of the capability-contradiction guard below. Assistant
  // turns are deliberately excluded — the assistant asking "Gmail or Outlook?" is not the user
  // naming providers.
  const recentUserTexts = (input.safeRecentTurns ?? [])
    .filter((t) => t.role === "user")
    .map((t) => t.text);
  const conversationTexts = [...recentUserTexts, safeGoalText];

  // A plan (or proposed edit ops) is already the preview path; an editing turn belongs to the edit
  // pipeline. Nothing to enforce structurally — but a plan-bearing reply whose PROSE denies a
  // capability the registry has still gets the prose repaired (the plan itself already disproves
  // the claim, so the shared lead-in is always truthful).
  if (editing || initialResult.workflowPlan || initialResult.mutationOperations) {
    if (!editing && initialResult.workflowPlan) {
      const contradiction = findCapabilityContradiction({
        guidanceText: initialResult.guidanceText,
        conversationTexts,
      });
      if (contradiction) {
        logCapabilityContradiction({ requestId, providerId: contradiction.providerId, handling: "plan_lead_in" });
        return {
          kind: "accept",
          result: { ...initialResult, guidanceText: PREVIEW_LEAD_IN },
          via: "initial",
        };
      }
    }
    return { kind: "accept", result: initialResult, via: "initial" };
  }

  const classification = classifyPreviewFirst({ goalText: safeGoalText, editing, recentUserTexts });
  const clarificationAllowed = classification.kind === "clarification_allowed";
  let result: WorkflowGuidanceIntakeResult & { readonly ok: true } = initialResult;
  let repairAttempted = false;
  let repairSkippedReason: "insufficient_budget" | undefined;
  let repairHadPlan: boolean | undefined;
  let repairPlanStage: string | undefined;
  let repairResponseChars: number | undefined;
  let fallbackPlanUsed = false;

  if (classification.kind === "preview_expected") {
    const remainingBudgetMs =
      GUIDANCE_ROUTE_MAX_DURATION_SECONDS * 1000 -
      (Date.now() - brainStartedAt) -
      ROUTE_BUDGET_SAFETY_MARGIN_MS;
    // Fail CLOSED on an uncomputable budget: a typed, retryable failure beats starting a call
    // that may outlive the function and die as an untyped platform 504.
    if (!Number.isFinite(remainingBudgetMs) || remainingBudgetMs < MIN_REPAIR_BUDGET_MS) {
      repairSkippedReason = "insufficient_budget";
    } else {
      repairAttempted = true;
      const firstReplyText = initialResult.guidanceText;
      const repairResult = await runWorkflowGuidanceIntakeCapability(
        {
          scope: input.scope,
          goalText: buildPreviewFirstRepairGoal({
            safeGoalText,
            namedProviders: classification.namedProviders,
            // REACT-AGENT-LIVE-BROWSER-CERTIFICATION-RUN-1 — when the first reply DID return a plan
            // that failed capability validation, repair that specific failure (name the rejected
            // ids) rather than ordering a plan the model already tried to give.
            ...(initialResult.planDiagnostics?.invalidCapabilityKeys?.length
              ? { invalidCapabilityKeys: initialResult.planDiagnostics.invalidCapabilityKeys }
              : {}),
          }),
          // The original request + the withheld first reply travel as conversation turns, so the
          // repair prompt carries everything the model needs to correct itself. Both are already
          // tokenized/model-safe (the first reply is the model's own output).
          recentTurns: [
            ...(input.safeRecentTurns ?? []),
            { role: "user" as const, text: safeGoalText },
            {
              role: "assistant" as const,
              text: firstReplyText.slice(0, MAX_GUIDANCE_CONVERSATION_TURN_TEXT),
            },
          ].slice(-MAX_GUIDANCE_CONVERSATION_TURNS),
          ...(input.definition ? { definition: input.definition } : {}),
          ...(input.fieldSchemaLines.length ? { fieldSchemaLines: input.fieldSchemaLines } : {}),
          ...(input.outputSchemaLines.length ? { outputSchemaLines: input.outputSchemaLines } : {}),
          ...(input.compactCapabilityLines?.length
            ? { compactCapabilityLines: input.compactCapabilityLines }
            : {}),
          ...(input.otherProvidersLine ? { otherProvidersLine: input.otherProvidersLine } : {}),
          contextInputs: input.contextInputs,
        },
        // Same requestId + caller signal; NO auditRecorder (see module header).
        { requestId, ...(input.signal ? { signal: input.signal } : {}) },
      );
      repairHadPlan = repairResult.ok && !!repairResult.workflowPlan;
      repairPlanStage = repairResult.ok ? repairResult.planDiagnostics?.stage : "REPAIR_CALL_FAILED";
      repairResponseChars = repairResult.ok ? repairResult.planDiagnostics?.responseChars : undefined;
      if (repairResult.ok && repairResult.workflowPlan) {
        result = repairResult; // the repaired reply flows through the normal pipeline
      }
    }

    // REACT-AGENT-PLAN-GENERATION-REGRESSION-AUDIT-1 — last resort AFTER model + repair both
    // produced no plan: the generic registry-driven chain fallback. It builds a skeletal plan ONLY
    // when the user explicitly named every app and each maps to exactly one capability; any
    // ambiguity → null and the typed failure stands. Steps carry NO config values (requiredInputs
    // come from real registry metadata), and the plan flows through the SAME downstream pipeline
    // (config prep, provider guard, entitlement gate, preview) as a model plan.
    if (!result.workflowPlan) {
      const fallbackPlan = inferNamedProviderChainPlan(safeGoalText);
      if (fallbackPlan) {
        fallbackPlanUsed = true;
        result = { ...initialResult, guidanceText: FALLBACK_PLAN_LEAD_IN, workflowPlan: fallbackPlan };
      }
    }
  }

  const finalHasPlan = !!result.workflowPlan;
  logPreviewFirstDecision({
    requestId,
    initialHadPlan: false,
    previewFirstClassification:
      classification.kind === "clarification_allowed" ? classification.reason : "preview_expected",
    namedProviderCount: classification.namedProviders.length,
    repairAttempted,
    repairSkippedReason,
    repairHadPlan,
    clarificationAllowed,
    finalOutcome: fallbackPlanUsed
      ? "deterministic_fallback_plan"
      : finalHasPlan
        ? "plan"
        : clarificationAllowed
          ? "clarification"
          : "preview_plan_missing",
    elapsedMs: Date.now() - brainStartedAt,
    initialPlanStage: initialResult.planDiagnostics?.stage,
    initialResponseChars: initialResult.planDiagnostics?.responseChars,
    initialTruncationSuspected: initialResult.planDiagnostics?.truncationSuspected,
    repairPlanStage,
    repairResponseChars,
    invalidCapabilityKeys: initialResult.planDiagnostics?.invalidCapabilityKeys,
  });

  if (!clarificationAllowed && !finalHasPlan) {
    // Server said "plan expected"; two attempts + the deterministic fallback produced none. The
    // route returns the typed failure + retry copy, never the questionnaire. The draft is untouched.
    return { kind: "plan_missing" };
  }

  // REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — a clarification-allowed, plan-less reply is the
  // one surface where model prose reaches the user unchallenged. If that prose denies a capability
  // the registry actually has for a provider the USER named ("ChainReact doesn't have a trigger for
  // Gmail"), replace it with honest registry-derived copy — the false claim is never surfaced.
  if (!finalHasPlan) {
    const contradiction = findCapabilityContradiction({
      guidanceText: result.guidanceText,
      conversationTexts,
    });
    if (contradiction) {
      logCapabilityContradiction({ requestId, providerId: contradiction.providerId, handling: "honest_copy" });
      result = { ...result, guidanceText: buildHonestCapabilityCopy(contradiction) };
    }
  }

  return {
    kind: "accept",
    result,
    via: fallbackPlanUsed ? "fallback" : repairHadPlan ? "repair" : "initial",
  };
}
