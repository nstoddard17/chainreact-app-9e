/**
 * React Agent service boundary — types (REACT-AGENT-CS-1-SERVICE-BOUNDARY).
 *
 * The React Agent is the IN-APP, customer-facing assistant (see
 * `docs/slices/phase-4/ai/react-agent-hermes-architecture.md`). This file defines the
 * narrow, account-scoped request/response contract for that boundary — and nothing else.
 *
 * CS-1 is a TYPES + SEAM slice only. It deliberately:
 *   - calls NO model, runs NO tool, mutates NO workflow, reads NO DB;
 *   - re-implements NO route-level auth / account-membership / credit-gating / telemetry
 *     (those stay owned by the existing AI routes — this boundary never duplicates them);
 *   - carries NO raw DTO / config / provider data — only scope ids + user text. Server-side
 *     re-derivation of any diagnosis DTO stays a route responsibility (as today).
 *
 * Later slices (CS-2+) wire the recognized intents to the EXISTING brains
 * (`answerWorkflowQuestion`, `explainWorkflowDiagnosis`, the repair preview) THROUGH the
 * gated routes — not by importing those services here in a way that bypasses gating.
 */

import type {
  ReactAgentCapabilityId,
  ReactAgentCapabilityMode,
} from "./capabilities";

/**
 * Who/what the request is for. Account-scoped: `accountId` is the V2 ownership +
 * billing spine, so it (and the acting `userId`) are REQUIRED. `workflowId` /
 * `conversationId` are optional context; `conversationId` is a session-local
 * placeholder until a persisted conversation model lands (CS-2+). No cross-account
 * scope is representable here by design.
 */
export interface ReactAgentScope {
  readonly userId: string;
  readonly accountId: string;
  readonly workflowId?: string;
  /** Session-local placeholder; NOT persisted yet (no conversation table in CS-1). */
  readonly conversationId?: string;
}

/**
 * Agent intents. Most map to ALREADY-SHIPPED, safe capabilities the agent will orchestrate
 * over (read-only Explain / Q&A, and the approval-gated repair PROPOSAL). `apply_repair`
 * (CS-7c) is the `requires_approval` APPLY intent — it is a valid intent so the capability
 * registry + `runAuthorizedCapability` can match it, but it is deliberately NOT in the
 * free-text recognized set below: an approved apply must ONLY run through the explicit
 * `runAuthorizedCapability` approval seam, never via the user-facing `handle()` text path.
 * `unknown` is the explicit catch-all for anything the boundary does not recognize.
 */
export type ReactAgentIntent =
  | "explain_diagnosis"
  | "answer_diagnosis_question"
  | "propose_repair"
  | "apply_repair"
  /**
   * HERMES-AGENT-CAPABILITY — advisory workflow-guidance intake (read-only). Like `apply_repair`
   * it is INTENTIONALLY EXCLUDED from the recognized free-text set below: this slice ships no UI,
   * so guidance runs ONLY through the explicit `runAuthorizedCapability` server seam, never via the
   * user-facing `handle()` text path. A future UI slice may add it to the recognized set.
   */
  | "request_workflow_guidance"
  | "unknown";

/**
 * The recognized (non-`unknown`) intents the free-text `handle()` seam will route. NOTE:
 * `apply_repair` is INTENTIONALLY EXCLUDED — apply is a mutation that must be gated behind
 * explicit approval through `runAuthorizedCapability`, so the text seam refuses it
 * (`unsupported_intent`) and can never initiate an apply.
 */
export const RECOGNIZED_REACT_AGENT_INTENTS = [
  "explain_diagnosis",
  "answer_diagnosis_question",
  "propose_repair",
] as const satisfies readonly ReactAgentIntent[];

/**
 * Boundary input. Intentionally minimal: free user text only. Raw diagnosis DTOs /
 * configs are NEVER posted through this boundary — they are re-derived server-side by
 * the route (the existing AI-DIAG pattern), so the boundary stays leak-safe.
 */
export interface ReactAgentInput {
  /** The user's message/question. Trimmed + length-validated downstream (route/brain). */
  readonly text?: string;
}

export interface ReactAgentRequest {
  readonly scope: ReactAgentScope;
  readonly intent: ReactAgentIntent;
  readonly input: ReactAgentInput;
}

/** Optional, safe "what to do next" hint the UI can render. No URLs with secrets. */
export type ReactAgentNextAction =
  | "open_validation_panel"
  | "open_node_config"
  | "review_proposed_change";

/** Why a request was not fulfilled. All map to safe, static, user-facing copy. */
export type ReactAgentRejectionReason =
  /** Scope failed validation (missing/blank userId or accountId). */
  | "invalid_scope"
  /** Intent not recognized (`unknown` or anything outside the recognized set). */
  | "unsupported_intent"
  /** Recognized intent, but the handler is not wired in this slice (CS-1). */
  | "not_yet_available"
  /** CS-3: the `capabilityId` is not in the React Agent capability registry. */
  | "unknown_capability"
  /** CS-3: the request intent does not match the capability's `allowedIntent`. */
  | "intent_mismatch";

export type ReactAgentResponse =
  | {
      readonly ok: true;
      /** SAFE user-facing message. Never raw model text, ids, tokens, or config. */
      readonly message: string;
      readonly nextAction?: ReactAgentNextAction;
      /**
       * Opaque reference to a proposed patch produced ELSEWHERE (the existing repair
       * preview), surfaced only when that path already supports it. Never a raw patch
       * body. Unused in CS-1.
       */
      readonly proposedPatchRef?: string;
    }
  | {
      readonly ok: false;
      readonly reason: ReactAgentRejectionReason;
      /** SAFE user-facing message — static copy only. */
      readonly message: string;
    };

/**
 * Outcome of a server-side authorized capability run (see `runAuthorizedCapability`).
 * On success it carries the EXACT result of the injected `exec` (e.g. the Q&A brain's
 * structured result), so the calling route's downstream telemetry + response mapping stay
 * unchanged. On failure it carries a safe rejection reason — these only fire for true
 * server-side invariants (blank scope / `unknown` intent), never for normal brain output.
 */
export type ReactAgentCapabilityOutcome<T> =
  | { readonly ok: true; readonly result: T }
  | {
      readonly ok: false;
      readonly reason: ReactAgentRejectionReason;
      readonly message: string;
    };

// ─── Audit recorder contract (REACT-AGENT-CS-5C/5D) ──────────────────────────
//
// The CONTRACT for the injectable audit recorder lives HERE in the boundary core
// (pure types — no DB / no repository import) so `runAuthorizedCapability` can
// reference the recorder + outcome types without importing the `audit/`
// submodule. The IMPLEMENTATION (which imports the DB repository) lives in
// `audit/` and is injected by the gated route; the core stays import-safe.

/** Outcome of an authorized capability run, as recorded in the governance ledger. */
export type ReactAgentAuditOutcome = "success" | "denied" | "failed";

/**
 * The SAFE input the seam hands the recorder. Every field is an id, a registry
 * enum, a safe reason/opaque-ref string, or an aggregate-safe `metadata` summary.
 * There is deliberately NO field for raw user text, model output, the safe DTO,
 * provider payloads, or workflow config.
 */
export interface ReactAgentAuditRecorderInput {
  readonly accountId: string;
  readonly actorUserId: string;
  readonly workflowId?: string | null;
  readonly conversationId?: string | null;
  readonly capabilityId: ReactAgentCapabilityId;
  readonly intent: ReactAgentIntent;
  readonly mode: ReactAgentCapabilityMode;
  readonly creditFeature?: string | null;
  readonly auditKind: string;
  readonly outcome: ReactAgentAuditOutcome;
  /** SAFE reason enum/string only (e.g. `invalid_scope`). NEVER a raw error. */
  readonly reason?: string | null;
  readonly proposedPatchRef?: string | null;
  readonly approvalId?: string | null;
  readonly aiCostEventId?: string | null;
  /** Aggregate-safe summary only. Sanitized + defaulted to `{}` by the recorder. */
  readonly metadata?: Record<string, unknown> | null;
}

/**
 * The injectable recorder seam. `record` is FAIL-OPEN — it must resolve (never
 * throw) on a persistence failure, so an audit-write problem can never break the
 * agent/user path. The default (no recorder injected) is no emission.
 */
export interface ReactAgentAuditRecorder {
  record(input: ReactAgentAuditRecorderInput): Promise<void>;
}

/**
 * The React Agent boundary contract.
 *
 * Two distinct seams:
 *   - `handle` — the USER-FACING text seam (CS-1). Validates scope, returns safe copy;
 *     recognized intents return `not_yet_available` until a UI/tool path wires them.
 *   - `runAuthorizedCapability` — the SERVER-SIDE execution seam (CS-2). A route that has
 *     ALREADY done auth + account-membership + safe-DTO derivation + `aiCreditGate` runs the
 *     already-gated brain call THROUGH this seam. The boundary validates scope + intent and
 *     invokes the injected `exec` — it imports no brain, calls no HTTP, and re-implements no
 *     gate. This is the single seam a later audit slice (CS-4) hooks into.
 *
 * Both async so signatures don't churn as real handlers land (CS-3+ / Hermes adapter).
 */
export interface ReactAgentService {
  handle(request: ReactAgentRequest): Promise<ReactAgentResponse>;
  runAuthorizedCapability<T>(input: {
    readonly scope: ReactAgentScope;
    readonly intent: ReactAgentIntent;
    /**
     * CS-3 — the registered capability this execution is for. Validated against the
     * capability registry: an unknown id or an intent that doesn't match the capability's
     * `allowedIntent` returns a safe failure WITHOUT running `exec`.
     */
    readonly capabilityId: ReactAgentCapabilityId;
    /** The already-authorized, already-gated capability execution (route-bound). */
    readonly exec: () => Promise<T>;
    /**
     * CS-5d — optional injected audit recorder. When present, the seam emits exactly
     * one `react_agent_audit_events` row per call: `denied` (no `exec`) for an invalid
     * scope / unknown capability / intent mismatch, `failed` when `exec` throws (then
     * re-throws), else the result of `classifyResult` (default `success`). The recorder
     * is fail-open, so emission can never change the returned outcome. Omitted → no
     * emission (the core never imports the recorder; the route injects it).
     */
    readonly auditRecorder?: ReactAgentAuditRecorder;
    /**
     * CS-5d — optional classifier mapping a RESOLVED `exec` result to an audit outcome
     * (e.g. a brain `{ ok: false }` model failure → `failed`). Default → `success`.
     * Does NOT affect the value returned to the caller.
     */
    readonly classifyResult?: (result: T) => ReactAgentAuditOutcome;
    /**
     * CS-7b — optional derivation of an OPAQUE `proposed_patch_ref` from a RESOLVED result
     * (a one-way content ref, e.g. a hash of the previewed operations + baseRevision).
     * Called only on the resolved path, fail-safe (throw/none → null). MUST NOT carry raw
     * patch/config/model text. Does NOT affect the value returned to the caller.
     */
    readonly deriveProposedPatchRef?: (result: T) => string | null | undefined;
  }): Promise<ReactAgentCapabilityOutcome<T>>;
}
