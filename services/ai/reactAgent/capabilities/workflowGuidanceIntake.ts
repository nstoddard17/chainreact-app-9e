/**
 * React Agent capability: workflow_guidance_intake (HERMES-AGENT-CAPABILITY).
 *
 * The server-only seam that runs the ADVISORY Hermes Agent workflow-guidance capability through the
 * existing React Agent governance allow-list (`runAuthorizedCapability`). A user asks for help
 * figuring out what workflow they need; Hermes Agent (via the public Render gateway) returns
 * clarifying questions / practical advisory guidance. ChainReact stays the final validator/governor.
 *
 * STRICTLY ADVISORY / READ-ONLY. This file:
 *   - imports NO workflow-mutation service or repository, calls NO model vendor / Nous / private
 *     Hermes Agent directly (only the gateway client), and reads NO secret except via the gateway
 *     client's own config (the gateway token never appears here);
 *   - never creates / updates / applies / runs / deletes a workflow;
 *   - is gated by `HERMES_AGENT_ENABLED` (default OFF) + gateway config — disabled/unconfigured →
 *     a typed unavailable result with NO network call;
 *   - runs through `runAuthorizedCapability`, so scope is shape-validated and (when a recorder is
 *     injected) exactly one governance audit row is emitted with safe metadata only.
 *
 * It lives in this `capabilities/` SUBMODULE (not a top-level boundary file) — like `audit/` — so the
 * React Agent core stays import-fenced (no HTTP/model in the core). A future gated route injects the
 * persistent audit recorder + the real account-membership authorization; this slice ships no route/UI.
 */

import type {
  GuidanceConversationTurn,
  GuidanceUnavailableCode,
  WorkflowGuidanceRequest,
} from "@/contracts/aiGuidance";
import type { AccountType } from "@/contracts/accounts";
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { PatchOperation } from "@/services/workflows/patch/types";
import type { EditableWorkflowGraph } from "@/contracts/editableWorkflowGraph";
import { sanitizeWorkflowForGuidance } from "@/services/ai-guidance/sanitizeWorkflowForGuidance";
import {
  buildSafeGuidanceContext,
  type SafeGuidanceContext,
} from "@/services/ai-guidance/guidanceContextPolicy";
import {
  requestHermesAgentGuidanceNormalized,
  type GatewayAttemptTelemetry,
  type GatewayFetch,
  type GatewayRetryDeps,
  type NormalizedGatewayGuidanceWithTelemetry,
} from "@/services/ai-guidance/gateway/hermesAgentGatewayClient";
import {
  getHermesAgentGatewayConfig,
  isHermesAgentEnabled,
} from "@/services/ai-guidance/gateway/gatewayConfig";
import type {
  GatewayPlanDiagnostics,
  SanitizedUsage,
} from "@/services/ai-guidance/gateway/gatewayResponseContract";
import { runAuthorizedCapability } from "../index";
import type { ReactAgentAuditRecorder, ReactAgentScope } from "../types";

export const WORKFLOW_GUIDANCE_INTAKE_CAPABILITY_ID = "workflow_guidance_intake" as const;
export const WORKFLOW_GUIDANCE_INTAKE_INTENT = "request_workflow_guidance" as const;

export interface WorkflowGuidanceIntakeInput {
  /** Account-scoped governance scope (userId + accountId required; workflowId optional). */
  readonly scope: ReactAgentScope;
  /** The user's own goal text (their words / latest turn). The prompt builder scrubs obvious secrets. */
  readonly goalText: string;
  /**
   * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — optional session-scoped recent conversation (plain-text
   * user/assistant turns) so a follow-up reads in context. Already bounded/role-checked by the route;
   * the prompt builder additionally redacts + truncates each turn. Request-scoped — never persisted.
   */
  readonly recentTurns?: readonly GuidanceConversationTurn[];
  /** Optional current draft/workflow — sanitized to the safe DTO (config/labels/ids dropped). */
  readonly definition?: WorkflowDefinition;
  /** Optional public capability catalog (provider:type keys) — safe, not user data. */
  readonly capabilityCatalog?: readonly string[];
  /**
   * REACT-CONFIG-COVERAGE-1 — pre-rendered field-schema lines for the narrowed relevant provider
   * subset (public registry metadata only; built by `promptFieldSchemas` in the route). Optional.
   */
  readonly fieldSchemaLines?: readonly string[];
  /**
   * REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — pre-rendered OUTPUT lines (what each relevant node
   * produces). Public registry metadata only; this is what makes {{...}} data mapping possible.
   */
  readonly outputSchemaLines?: readonly string[];
  /**
   * HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the SAFE, model-facing editable graph of the user's CURRENT local
   * draft (opaque refs + safe editable config + version), built by the route via the editor privacy
   * boundary. Present ONLY for an EDIT request. It carries NO real ids/credentials/secrets; the route
   * keeps the private ref→realId map. Forwarded to the prompt so the model proposes ops against it.
   */
  readonly editableGraph?: EditableWorkflowGraph;
  /**
   * HERMES-AGENT-MEMORY-SCOPE-GUARD — server-resolved raw inputs for the scope-guarded context. The
   * route gathers these under existing authorization; the client never supplies them. Optional fields
   * are simply omitted from the context when not safely available. Identity (userId) comes from
   * `scope`, not here.
   */
  readonly contextInputs?: {
    readonly account: { readonly type: AccountType; readonly role?: string };
    /** Creator of the authorized workflow (own-vs-foreign comparison only). */
    readonly workflowCreatedByUserId?: string;
    /** Account-shared connection providers known available (safe). */
    readonly sharedCredentialProviders?: readonly string[];
    /** The caller's OWN connection providers (safe for them). */
    readonly ownConnectionProviders?: readonly string[];
  };
}

export interface WorkflowGuidanceIntakeDeps {
  /** Injected by a gated route to persist a governance audit row. Omitted → no emission. */
  readonly auditRecorder?: ReactAgentAuditRecorder;
  /** Test seam — injected mock gateway fetch (no live call in CI). */
  readonly fetchImpl?: GatewayFetch;
  /**
   * REACT-AGENT-RETRY-BACKOFF-1 — ONE logical id for this user submission. Both internal Hermes
   * attempts carry it, so the two attempts are provably one request rather than two. The governance
   * row is still written ONCE, for the final outcome.
   */
  readonly requestId?: string;
  /** The incoming request's cancellation signal — aborts the in-flight attempt AND the backoff. */
  readonly signal?: AbortSignal;
  /** Test seam — injected clock/sleep/RNG so retry tests never wait real seconds. */
  readonly retryDeps?: GatewayRetryDeps;
}

export type WorkflowGuidanceIntakeResult =
  | {
      readonly ok: true;
      readonly guidanceText: string;
      readonly source: "hermes-agent";
      /** null unless a structured plan passed validateWorkflowPlan upstream (advisory only). */
      readonly workflowPlan: WorkflowPlan | null;
      /** HERMES-AGENT-WORKFLOW-EDITOR — structurally-valid edit operations the model proposed, or absent. */
      readonly mutationOperations?: readonly PatchOperation[];
      /** HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the editable-graph version the model echoed back (stale guard). */
      readonly mutationBaseVersion?: string;
      /** HERMES-AGENT-WORKFLOW-EDITOR — a mutation block was present but unusable (route shows safe copy). */
      readonly mutationMalformed?: boolean;
      readonly rawUsage?: SanitizedUsage;
      readonly warnings?: readonly string[];
      /** REACT-AGENT-RETRY-BACKOFF-1 — safe attempt/retry counters for logging + audit metadata. */
      readonly attemptTelemetry?: GatewayAttemptTelemetry;
      /** REACT-AGENT-PLAN-GENERATION-REGRESSION-AUDIT-1 — typed plan-stage diagnostics (safe enums/counts). */
      readonly planDiagnostics?: GatewayPlanDiagnostics;
    }
  | {
      readonly ok: false;
      readonly code: GuidanceUnavailableCode | "INVALID_SCOPE";
      readonly message: string;
      readonly attemptTelemetry?: GatewayAttemptTelemetry;
    };

/** Static, leak-safe copy. No ids / tokens / config / raw model text. */
const UNAVAILABLE_MESSAGE =
  "Workflow guidance isn't available right now. ChainReact will validate any suggestion before anything is built.";

/** Build the safe, de-identified guidance request from an optional draft (else an empty shape). */
function buildSafeRequest(definition: WorkflowDefinition | undefined): WorkflowGuidanceRequest {
  if (definition) return sanitizeWorkflowForGuidance({ definition, guidanceKind: "workflow_design" }).request;
  return { schemaVersion: 1, guidanceKind: "workflow_design", workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] } };
}

/**
 * Run the advisory workflow-guidance capability. Gated + fail-closed; never mutates a workflow.
 * Returns normalized advisory guidance, or a typed unavailable result (no network when disabled).
 */
export async function runWorkflowGuidanceIntakeCapability(
  input: WorkflowGuidanceIntakeInput,
  deps: WorkflowGuidanceIntakeDeps = {},
): Promise<WorkflowGuidanceIntakeResult> {
  // Gate BEFORE any network: disabled / unconfigured → unavailable, no fetch.
  if (!isHermesAgentEnabled()) return { ok: false, code: "PROVIDER_DISABLED", message: UNAVAILABLE_MESSAGE };
  const config = getHermesAgentGatewayConfig();
  if (!config) return { ok: false, code: "PROVIDER_NOT_CONFIGURED", message: UNAVAILABLE_MESSAGE };

  const request = buildSafeRequest(input.definition);

  // HERMES-AGENT-MEMORY-SCOPE-GUARD — build the scope-guarded context from server-resolved inputs. The
  // selector guarantees no other-member private data / secrets / identity ever crosses the boundary.
  const context: SafeGuidanceContext | undefined = input.contextInputs
    ? buildSafeGuidanceContext({
        viewerUserId: input.scope.userId,
        account: input.contextInputs.account,
        // Workflow scope only when there's an authorized workflow draft (definition present + creator).
        ...(input.definition && input.contextInputs.workflowCreatedByUserId
          ? {
              workflow: {
                createdByUserId: input.contextInputs.workflowCreatedByUserId,
                generalized: request.workflow,
              },
            }
          : {}),
        ...(input.contextInputs.sharedCredentialProviders
          ? { sharedCredentialProviders: input.contextInputs.sharedCredentialProviders }
          : {}),
        ...(input.contextInputs.ownConnectionProviders
          ? { ownConnectionProviders: input.contextInputs.ownConnectionProviders }
          : {}),
      })
    : undefined;

  // Run through the governance allow-list. Scope is shape-validated here; a future route owns the
  // real account-membership authorization. The injected recorder (if any) emits one safe audit row.
  const outcome = await runAuthorizedCapability<NormalizedGatewayGuidanceWithTelemetry>({
    scope: input.scope,
    intent: WORKFLOW_GUIDANCE_INTAKE_INTENT,
    capabilityId: WORKFLOW_GUIDANCE_INTAKE_CAPABILITY_ID,
    ...(deps.auditRecorder ? { auditRecorder: deps.auditRecorder } : {}),
    classifyResult: (r) => (r.ok ? "success" : "failed"),
    // REACT-AGENT-PRODUCTION-TIMEOUT-1 — persist WHICH failure it was. `code` is the gateway
    // contract's fixed union (TIMEOUT / PROVIDER_ERROR / INVALID_RESPONSE / PROVIDER_*), never a
    // provider message or model text, so the audit row stays leak-free while telling a later
    // investigation whether the brain was slow or the gateway was down.
    classifyReason: (r) => (r.ok ? null : `exec_failed:${r.code}`),
    // REACT-AGENT-RETRY-BACKOFF-1 — ONE governance row per user submission, with the internal
    // attempts represented as safe metadata (fixed keys, numbers + policy enums only — no prompt,
    // response, provider message, header, id, or user content can reach this).
    classifyMetadata: (r) => {
      const t = r.attemptTelemetry;
      if (!t) return null;
      return {
        attempts: t.attempts,
        retried: t.retried,
        ...(t.retryReason ? { retryReason: t.retryReason } : {}),
        ...(t.retrySkippedReason ? { retrySkippedReason: t.retrySkippedReason } : {}),
        backoffMs: t.backoffMs,
        elapsedMs: t.elapsedMs,
      };
    },
    exec: () =>
      requestHermesAgentGuidanceNormalized({
        request,
        config,
        goalText: input.goalText,
        ...(input.recentTurns && input.recentTurns.length ? { recentTurns: input.recentTurns } : {}),
        ...(input.capabilityCatalog ? { capabilityCatalog: input.capabilityCatalog } : {}),
        ...(input.fieldSchemaLines ? { fieldSchemaLines: input.fieldSchemaLines } : {}),
        ...(input.outputSchemaLines ? { outputSchemaLines: input.outputSchemaLines } : {}),
        ...(context ? { context } : {}),
        ...(input.editableGraph ? { editableGraph: input.editableGraph } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.requestId ? { requestId: deps.requestId } : {}),
        ...(deps.signal ? { signal: deps.signal } : {}),
        ...(deps.retryDeps ? { retryDeps: deps.retryDeps } : {}),
      }),
  });

  // Governance invariant failure (only fires for a blank scope on this server-only path).
  if (!outcome.ok) return { ok: false, code: "INVALID_SCOPE", message: UNAVAILABLE_MESSAGE };

  const guidance = outcome.result;
  if (!guidance.ok) {
    return {
      ok: false,
      code: guidance.code,
      message: UNAVAILABLE_MESSAGE,
      ...(guidance.attemptTelemetry ? { attemptTelemetry: guidance.attemptTelemetry } : {}),
    };
  }

  return {
    ok: true,
    ...(guidance.attemptTelemetry ? { attemptTelemetry: guidance.attemptTelemetry } : {}),
    guidanceText: guidance.guidanceText,
    source: guidance.source,
    workflowPlan: guidance.workflowPlan,
    ...(guidance.mutationOperations ? { mutationOperations: guidance.mutationOperations } : {}),
    ...(guidance.mutationBaseVersion ? { mutationBaseVersion: guidance.mutationBaseVersion } : {}),
    ...(guidance.mutationMalformed ? { mutationMalformed: guidance.mutationMalformed } : {}),
    ...(guidance.rawUsage ? { rawUsage: guidance.rawUsage } : {}),
    ...(guidance.warnings ? { warnings: guidance.warnings } : {}),
    ...(guidance.planDiagnostics ? { planDiagnostics: guidance.planDiagnostics } : {}),
  };
}
