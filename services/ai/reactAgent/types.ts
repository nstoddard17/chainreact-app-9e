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
 * Recognized agent intents. These map to ALREADY-SHIPPED, safe capabilities the agent
 * will orchestrate over in CS-2+ (read-only Explain / Q&A, and approval-gated repair
 * PROPOSAL — never autonomous apply). `unknown` is the explicit catch-all for anything
 * the boundary does not recognize.
 */
export type ReactAgentIntent =
  | "explain_diagnosis"
  | "answer_diagnosis_question"
  | "propose_repair"
  | "unknown";

/** The recognized (non-`unknown`) intents, for validation + exhaustiveness. */
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
  | "not_yet_available";

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
 * The React Agent boundary contract. CS-1 ships a no-op implementation
 * (`dispatchReactAgentRequest`) that validates scope and returns safe rejections; CS-2+
 * replace the `not_yet_available` branches with delegation to the existing gated routes.
 * Async by design so the signature does not churn when real (async) handlers land.
 */
export interface ReactAgentService {
  handle(request: ReactAgentRequest): Promise<ReactAgentResponse>;
}
