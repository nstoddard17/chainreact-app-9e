import { computeAiCreditCharge } from "@/core/billing/aiCreditPolicy";
import type { ModelTier } from "@/core/ai/modelTypes";
import { aiCreditGate, type AiCreditGateOutcome } from "@/services/billing/aiCreditGate";
import {
  recordAiModelCallCompleted,
  recordAiModelCallFailed,
} from "@/services/billing/aiCostEvents";
import { getAiActionRegistryEntry, type AiProviderFeature } from "./aiActionRegistry";
import { createAiProcessorClient } from "./createAiProcessorClient";
import { resolveModelRoute } from "./resolveModelRoute";
import type {
  AiProcessorClient,
  AiProcessorFailureCode,
  AiProcessorUsage,
  AiProcessRequest,
  ModelRoute,
} from "./types";

/**
 * The standard AI action pipeline (AI-PROVIDER-2 CS-2, plan decision 12).
 *
 * The SINGLE runner every AI action/capability executes through — no
 * handler ever implements its own billing, gating, routing, or ledger
 * logic. Ordered flow:
 *
 *   registry lookup (fail-closed)
 *   → enabled-flag check
 *   → tier resolution (config ∩ registry supportedTiers)
 *   → credit estimate (REFUSES unpriced features — never the 5-credit
 *     unmapped fallback; CS-3 prices document_analysis / data_transform /
 *     schema_suggestion and flips this from refusal to normal flow)
 *   → aiCreditGate (atomic deduct; fail-closed; testMode skip per the
 *     existing gate policy)
 *   → resolveModelRoute → AiProcessorClient.process
 *   → caller-supplied strict validation
 *   → ai_cost_events ledger write (sanitized, FAIL-OPEN — recording never
 *     blocks the action, matching AI-CREDITS-2 recording policy)
 *   → typed outcome.
 *
 * No-leak: ledger metadata carries ONLY task/mode/tier/source/modelTag/
 * counts. Prompts, instructions, document text, input JSON, output
 * values, and gateway bodies never reach the ledger (the aiCostEvents
 * sanitizer is defense-in-depth behind that).
 *
 * AI-PROVIDER-3 (CS-3): the registry's `AiProviderFeature` is valid for
 * BOTH the model layer and the ledger by construction, so the interim
 * casts are gone — the feature flows unmodified from registry → credit
 * policy → gate → model client → `ai_cost_events.feature`.
 */

export interface ExecuteAiActionInput<T> {
  readonly actionKey: string;
  /** Cost-owner account (resolved server-side; never client-supplied). */
  readonly accountId: string;
  /** Actor for ledger provenance (workflow creator / requesting user). */
  readonly userId: string;
  readonly workflowId?: string | null;
  readonly workflowRunId?: string | null;
  readonly testMode?: boolean;
  /** Requested tier; must be in the registry entry's supportedTiers. */
  readonly requestedTier?: ModelTier;
  readonly escalated?: boolean;
  readonly request: AiProcessRequest;
  /** Caller's STRICT payload validator (runs after processor success). */
  readonly validate: (
    payload: unknown,
  ) => { ok: true; value: T } | { ok: false; issues: readonly string[] };
}

export type ExecuteAiActionOutcome<T> =
  | {
      readonly status: "success";
      readonly value: T;
      readonly usage?: AiProcessorUsage;
      readonly modelTag: string;
      readonly source: "gateway" | "first_party";
      readonly tier: ModelTier;
      readonly feature: AiProviderFeature;
      /** Credits actually deducted by the gate (0 when skipped/test mode). */
      readonly creditsCharged: number;
      /** Policy-computed price for this call, independent of gate skipping. */
      readonly estimatedCredits: number;
    }
  | {
      readonly status: "preflight_refused";
      readonly reason:
        | "unknown_action"
        | "disabled"
        | "tier_unsupported"
        | "feature_not_priced"
        | "credits_refused";
      readonly message: string;
      readonly gate?: AiCreditGateOutcome;
    }
  | {
      readonly status: "provider_failed";
      readonly code: AiProcessorFailureCode;
      readonly retryable: boolean;
      readonly message: string;
    }
  | {
      readonly status: "invalid_output";
      readonly message: string;
      /** Field NAMES / issue labels only — never values. */
      readonly issues: readonly string[];
    };

/** Injectable ledger seam. Default wraps services/billing/aiCostEvents, fail-open. */
export interface AiActionLedger {
  recordCompleted(input: {
    accountId: string;
    userId: string;
    feature: AiProviderFeature;
    workflowId?: string | null;
    workflowRunId?: string | null;
    modelTag: string;
    source: "gateway" | "first_party";
    usage?: AiProcessorUsage;
    creditsCharged: number;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  recordFailed(input: {
    accountId: string;
    userId: string;
    feature: AiProviderFeature;
    workflowId?: string | null;
    workflowRunId?: string | null;
    modelTag?: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

function defaultLedger(): AiActionLedger {
  return {
    async recordCompleted(input) {
      try {
        await recordAiModelCallCompleted(
          {
            accountId: input.accountId,
            userId: input.userId,
            feature: input.feature,
            workflowId: input.workflowId ?? null,
            workflowRunId: input.workflowRunId ?? null,
          },
          {
            modelName: input.modelTag,
            modelProvider: input.source,
            inputTokens: input.usage?.inputTokens,
            outputTokens: input.usage?.outputTokens,
            aiCreditsCharged: input.creditsCharged,
            metadata: input.metadata,
          },
        );
      } catch {
        // FAIL-OPEN: recording never blocks the action (AI-CREDITS-2 policy).
      }
    },
    async recordFailed(input) {
      try {
        await recordAiModelCallFailed(
          {
            accountId: input.accountId,
            userId: input.userId,
            feature: input.feature,
            workflowId: input.workflowId ?? null,
            workflowRunId: input.workflowRunId ?? null,
          },
          {
            ...(input.modelTag ? { modelName: input.modelTag } : {}),
            metadata: input.metadata,
          },
        );
      } catch {
        // FAIL-OPEN.
      }
    },
  };
}

export interface ExecuteAiActionDeps {
  readonly gate?: typeof aiCreditGate;
  readonly resolveRoute?: typeof resolveModelRoute;
  readonly createClient?: (
    route: ModelRoute,
    feature: AiProviderFeature,
  ) => AiProcessorClient;
  readonly ledger?: AiActionLedger;
}

/** Recording is FAIL-OPEN at the pipeline level too — a throwing ledger
 *  implementation never changes the action outcome (AI-CREDITS-2 policy). */
async function recordSafely(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch {
    // fail-open
  }
}

export async function executeAiAction<T>(
  input: ExecuteAiActionInput<T>,
  deps: ExecuteAiActionDeps = {},
): Promise<ExecuteAiActionOutcome<T>> {
  // 1. Registry lookup — FIRST and fail-closed: an unknown key never
  //    reaches the gate or a model call.
  const entry = getAiActionRegistryEntry(input.actionKey);
  if (!entry) {
    return {
      status: "preflight_refused",
      reason: "unknown_action",
      message: "This AI capability is not registered.",
    };
  }

  // 2. Enabled flag (registry-declared; AI_PROCESSOR_ENABLED phase 1).
  if (process.env[entry.enabledFlag] !== "true") {
    return {
      status: "preflight_refused",
      reason: "disabled",
      message: "This AI capability is not enabled on this environment.",
    };
  }

  // 3. Tier resolution against the registry's supported tiers.
  const tier: ModelTier = input.requestedTier ?? "fast";
  if (!entry.supportedTiers.includes(tier)) {
    return {
      status: "preflight_refused",
      reason: "tier_unsupported",
      message: "The requested model quality is not available for this capability.",
    };
  }

  // 4. Credit estimate — refuse UNPRICED features instead of silently
  //    riding the conservative unmapped fallback (CS-3 flips this).
  const estimate = computeAiCreditCharge({
    feature: entry.feature,
    isLlmCall: true,
    modelTier: tier,
    ...(input.escalated !== undefined ? { escalated: input.escalated } : {}),
  });
  if (!estimate.mapped) {
    return {
      status: "preflight_refused",
      reason: "feature_not_priced",
      message:
        "This AI capability has no credit price configured yet (pending CS-3 billing).",
    };
  }

  // 5. Credit gate BEFORE any model call (atomic deduct; fail-closed;
  //    testMode skips charging per the existing gate policy).
  const gate = await (deps.gate ?? aiCreditGate)({
    accountId: input.accountId,
    feature: entry.feature,
    plannedTier: tier,
    ...(input.escalated !== undefined ? { escalated: input.escalated } : {}),
    ...(input.testMode !== undefined ? { testMode: input.testMode } : {}),
  });
  if (!gate.ok) {
    return {
      status: "preflight_refused",
      reason: "credits_refused",
      message:
        gate.reason === "insufficient_ai_credits"
          ? "Not enough AI credits for this step."
          : gate.reason === "account_frozen"
            ? "This account is frozen."
            : "AI credits could not be verified.",
      gate,
    };
  }
  const creditsCharged = "charged" in gate ? gate.charged : 0;

  // 6. Route + client. Handlers never pick vendors — the seam does.
  const route = (deps.resolveRoute ?? resolveModelRoute)({
    feature: entry.feature,
    tier,
    task: input.request.task,
  });
  const client = (deps.createClient ?? createAiProcessorClient)(route, entry.feature);

  const ledger = deps.ledger ?? defaultLedger();
  const baseLedgerScope = {
    accountId: input.accountId,
    userId: input.userId,
    feature: entry.feature,
    workflowId: input.workflowId ?? null,
    workflowRunId: input.workflowRunId ?? null,
  };
  const safeMeta: Record<string, unknown> = {
    task: input.request.task,
    ...(input.request.task === "analyze_document" ? { mode: input.request.mode } : {}),
    tier,
    routeProvider: route.provider,
    testMode: input.testMode === true,
    // Policy price for this call. Differs from `creditsCharged` whenever the
    // gate skipped (enforcement off / test mode / frozen) — recording both
    // keeps "what it would cost" queryable during the recording-only phase.
    estimatedCredits: estimate.credits,
    creditPolicyVersion: estimate.policyVersion,
  };

  // 7. The model call.
  const result = await client.process(input.request);
  if (!result.ok) {
    await recordSafely(() =>
      ledger.recordFailed({
        ...baseLedgerScope,
        metadata: { ...safeMeta, failureCode: result.code, retryable: result.retryable },
      }),
    );
    return {
      status: "provider_failed",
      code: result.code,
      retryable: result.retryable,
      message: result.message,
    };
  }

  // 8. Caller-supplied strict validation (after processor success).
  const validated = input.validate(result.payload);
  if (!validated.ok) {
    await recordSafely(() =>
      ledger.recordFailed({
        ...baseLedgerScope,
        modelTag: result.modelTag,
        metadata: {
          ...safeMeta,
          failureCode: "OUTPUT_VALIDATION_FAILED",
          source: result.source,
          validationIssueCount: validated.issues.length,
        },
      }),
    );
    return {
      status: "invalid_output",
      message: "The AI result did not match the expected output.",
      issues: validated.issues,
    };
  }

  // 9. Ledger (fail-open) + success.
  await recordSafely(() =>
    ledger.recordCompleted({
      ...baseLedgerScope,
      modelTag: result.modelTag,
      source: result.source,
      ...(result.usage ? { usage: result.usage } : {}),
      creditsCharged,
      metadata: {
        ...safeMeta,
        source: result.source,
        usageSource: result.source === "gateway" ? "gateway_reported" : "provider_reported",
      },
    }),
  );

  return {
    status: "success",
    value: validated.value,
    ...(result.usage ? { usage: result.usage } : {}),
    modelTag: result.modelTag,
    source: result.source,
    tier,
    feature: entry.feature,
    creditsCharged,
    estimatedCredits: estimate.credits,
  };
}
