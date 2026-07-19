import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ResolveContext } from "@/workflow-engine/variables/resolveValue";
import type { ExecutionDefinitionMode } from "@/services/workflows/activeRevision";

/**
 * Public types for the workflow execution engine. Extracted from
 * `engine.ts` (max-lines lint cleanup, AI-28 follow-up).
 *
 * No behavior change — `engine.ts` re-exports every type from this module
 * so existing `import { RunResult, ... } from "@/services/execution/engine"`
 * call sites stay working. Engine internals (the `WorkflowEngine` class,
 * the standalone helpers in `runPersistence.ts` / `executionOrder.ts`)
 * consume these types directly from this file.
 */

export type RunFailureCode =
  | "WORKFLOW_NOT_FOUND"
  | "TRIGGER_NODE_NOT_FOUND"
  | "BILLING_EXHAUSTED"
  | "MISSING_HANDLER"
  | "MISSING_VARIABLE"
  | "HANDLER_FAILED"
  /**
   * B — pre-dispatch execution-readiness backstop. The workflow is structurally
   * invalid (orphan/unreachable action, stale edge, no/multiple triggers) or has
   * an action with empty required config. Fails the run with a friendly message
   * instead of silently skipping orphans or dumping a raw handler Zod error.
   * Real runs only (test mode skips external handlers). The detail (missing
   * fields vs invalid graph) rides in the fatalError message.
   */
  | "WORKFLOW_NOT_READY"
  /**
   * BRANCH-ENT-1 — the effective definition uses advanced branching (If/Then
   * Condition / Router) but the workflow-owning account's CURRENT billing does
   * not entitle it (Free, or a canceled/incomplete subscription; unknown fails
   * closed). Checked at the engine's universal pre-execution choke point —
   * BEFORE readiness and billing, for test AND real runs — so no handler runs,
   * no side effect occurs, and no task is deducted. Humanizes to the
   * `upgrade_plan` action.
   */
  | "PLAN_FEATURE_REQUIRED"
  /**
   * COST-15C — a run row already exists for this runId when the engine tried
   * to create the pre-run row. The dispatch is a duplicate/replay; the engine
   * refuses to re-execute (no double side effects / double billing). Not
   * persisted — the original dispatch owns the row.
   */
  | "DUPLICATE_DISPATCH"
  /**
   * Handler returned `branchTaken: "<label>"` but no outgoing edge on this
   * node has that label. The engine consumes this in Commit 2 (label-aware
   * traversal); Commit 1 only adds the code + humanizer support. See
   * docs/slices/parity/engine-branching-plan.md §3.3 + §6.1.
   */
  | "INVALID_BRANCH"
  /**
   * CR-FAILREASON-1 — provider-agnostic auth/refresh failure, normalized at the
   * engine's handler-error boundary from `Unauthorized401Error` /
   * `IntegrationActionRequiredError`. The humanizer maps it to the `reconnect`
   * action. The raw error message is kept in `steps[].error.message` for
   * server-side diagnostics only; the user-facing classification is code-derived.
   */
  | "INTEGRATION_REAUTH_REQUIRED"
  /**
   * CR-FAILREASON-1 — provider returned 403 for a missing scope, normalized from
   * `InsufficientScopeError`. A token refresh keeps the same scopes, so only
   * re-consent (reconnect) fixes it. Humanizer maps it to `reconnect`.
   */
  | "INTEGRATION_SCOPE_REQUIRED"
  /**
   * CR-FAILREASON-1 — a transient provider failure (timeout / aborted request),
   * normalized from `AbortError` / `TimeoutError` at the handler boundary.
   * Humanizer maps it to `retry_later`.
   */
  | "TRANSIENT_PROVIDER_ERROR";

export interface RunStepResult {
  nodeId: string;
  status: "succeeded" | "failed" | "skipped";
  output?: Readonly<Record<string, unknown>>;
  error?: { code: RunFailureCode; message: string; details?: Record<string, unknown> };
}

export interface RunResult {
  runId: string;
  workflowId: string;
  status: "succeeded" | "failed";
  steps: readonly RunStepResult[];
  startedAt: string;
  finishedAt: string;
  /** Top-level failure when the run never reached the per-step loop. */
  fatalError?: { code: RunFailureCode; message: string };
  /** Slice 3.SEC-2 — true when engine ran in test mode (handlers gated). */
  isTest: boolean;
  /** Slice 3.SEC-2 — how the run was triggered. Persisted to workflow_runs. */
  triggeredBy: RunTriggerSource;
}

/**
 * How a run was started. Persisted into `workflow_runs.triggered_by` so
 * post-mortems can attribute runs without inferring from `trigger_event`.
 *
 * - `manual`    — user clicked Run-now (real execution).
 * - `test`      — user clicked Test (engine `testMode` true; external
 *                 handlers short-circuited).
 * - `webhook`   — provider webhook delivery dispatched the run.
 * - `scheduled` — cron-triggered run.
 * - `retry`     — a failed run was retried.
 * - `api_key`   — public API-key trigger (`POST /api/v1/workflows/[id]/trigger`).
 *                 No human actor (`triggered_by_user_id` stays null); attribution
 *                 is carried by `triggered_by_api_key_id` / `_prefix`
 *                 (4.API-KEYS-RUN-HISTORY). RH-1 adds the value only — the public
 *                 route still enqueues as `manual` until RH-2 threads it.
 * - `unknown`   — pre-SEC-2 rows + any future entry path that hasn't
 *                 declared its source yet.
 *
 * Kept as a TS literal union (not a Zod enum) because this is engine-
 * internal — input validation happens at the route layer. The DB
 * check constraint is the authoritative gate against drift.
 */
export type RunTriggerSource =
  | "manual"
  | "test"
  | "webhook"
  | "scheduled"
  | "retry"
  | "api_key"
  | "unknown";

export interface RunWorkflowInput {
  workflowId: string;
  triggerNodeId: string;
  triggerEvent: TriggerEvent;
  /** Optional pre-assigned id (the dispatcher's enqueueRun supplies one). */
  runId?: string;
  /**
   * Slice 3.SEC-2 — when true, the engine consults the test-mode gate
   * before invoking each handler and short-circuits external / high-risk
   * actions. Default: `false` (real execution). Callers that want a safe
   * preview MUST pass `true` explicitly — the engine never silently
   * promotes a real run to test mode.
   */
  testMode?: boolean;
  /**
   * Slice 3.SEC-2 — how the run was kicked off. Persisted to
   * `workflow_runs.triggered_by`. Defaults to `"unknown"` when omitted.
   * Callers (run-now route, webhook dispatcher, cron) MUST supply their
   * own source label.
   */
  triggeredBy?: RunTriggerSource;
  /**
   * 4.ACCOUNT-MODEL-8 — the human ACTOR who triggered this run, persisted to
   * `workflow_runs.triggered_by_user_id`. Set ONLY for human-initiated runs:
   * manual run-now + retry pass the caller's userId. Webhook / polling / cron
   * / scheduled / system runs leave it undefined → NULL (no human actor — the
   * run must not falsely claim a human trigger). Provenance, not authorization;
   * run OWNERSHIP comes from the workflow's account_id, not this field.
   */
  triggeredByUserId?: string | null;
  /**
   * RH-2 — public API-key provenance, persisted to
   * `workflow_runs.triggered_by_api_key_id` / `_prefix`. Set ONLY by the public
   * API-key trigger route (with `triggeredBy: "api_key"`, `triggeredByUserId: null`).
   * Every other entry path (manual/retry/webhook/cron) leaves them undefined → NULL.
   * The prefix is a non-secret snapshot; the raw key/hash never reach here.
   */
  triggeredByApiKeyId?: string | null;
  triggeredByApiKeyPrefix?: string | null;
  /**
   * V2-READY-41E — which definition to execute (see `ExecutionDefinitionMode`).
   * Omitted → derived from `testMode` (`testMode ? "draft" : "live"`) so a test
   * preview never accidentally executes the published revision and a real run
   * never silently reads the draft. Live trigger paths (webhook/cron/poll/public
   * API) omit it and get "live"; the run-now route passes it explicitly.
   */
  executionDefinitionMode?: ExecutionDefinitionMode;
}

export interface EngineDependencies {
  /** Injected so this slice can ship before Slice 1K.1's resolver lands. */
  resolveStrict: (value: unknown, context: ResolveContext) => unknown;
}
