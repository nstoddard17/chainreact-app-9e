/**
 * React Agent audit recorder — types (REACT-AGENT-CS-5C-AUDIT-RECORDER).
 *
 * The recorder maps a SAFE React Agent capability outcome onto the
 * `react_agent_audit_events` ledger (CS-5b). It lives in this `audit/` submodule
 * — NOT in the React Agent core (`index.ts` / `types.ts` / `capabilities.ts`) —
 * precisely because it depends on the DB repository. The core stays import-safe
 * (no DB / no service-role); CS-5d injects a recorder into
 * `runAuthorizedCapability` from the ROUTE, which is allowed to import this.
 *
 * NO-LEAK CONTRACT (mirrors the ledger + `ai_cost_events`): the recorder persists
 * only ids, registry enums, safe reason/opaque-ref strings, the cost-event link,
 * and a sanitized aggregate-safe `metadata` object. It NEVER stores raw prompts,
 * model answers, secrets, tokens, raw provider payloads, or raw workflow config —
 * `metadata` is run through the shared `sanitizeAiEventMetadata` denylist and the
 * DB CHECKs are the final backstop.
 */

import type {
  ReactAgentCapabilityId,
} from "../capabilities";
import type { ReactAgentIntent } from "../types";
import type {
  ReactAgentAuditMode,
  ReactAgentAuditOutcome,
} from "@/repositories/reactAgentAuditEvents";

export type {
  ReactAgentAuditMode,
  ReactAgentAuditOutcome,
} from "@/repositories/reactAgentAuditEvents";

/**
 * The SAFE input the React Agent seam hands the recorder. Every field is an id,
 * a registry enum, a safe reason/opaque-ref string, or an aggregate-safe
 * `metadata` summary. There is deliberately NO field for raw user text, model
 * output, provider payloads, or workflow config.
 */
export interface ReactAgentAuditRecorderInput {
  /** Owning account (the V2 ownership/billing spine; RLS read-gate). */
  readonly accountId: string;
  /** The acting user (provenance, not owner). */
  readonly actorUserId: string;
  /** Optional workflow context. */
  readonly workflowId?: string | null;
  /** Session-local placeholder (no conversations table yet). */
  readonly conversationId?: string | null;
  /** The registered capability that ran (closed set). */
  readonly capabilityId: ReactAgentCapabilityId;
  /** The request intent the capability ran for (closed set). */
  readonly intent: ReactAgentIntent;
  /** How the capability affects workflow state (read_only at launch). */
  readonly mode: ReactAgentAuditMode;
  /** The `ai_cost_events.feature` the route charges, or null for 0-credit. */
  readonly creditFeature?: string | null;
  /** Registry-sourced audit-event kind (e.g. `react_agent.diagnosis_qa`). */
  readonly auditKind: string;
  /** Outcome of the run. */
  readonly outcome: ReactAgentAuditOutcome;
  /** SAFE reason enum/string only (e.g. `invalid_scope`). NEVER a raw error. */
  readonly reason?: string | null;
  /** Opaque ref to a proposed patch (future proposes-change). Never a body. */
  readonly proposedPatchRef?: string | null;
  /** Opaque approval id (future requires-approval). */
  readonly approvalId?: string | null;
  /** Link to the cost/observability event for this run (no cost duplication). */
  readonly aiCostEventId?: string | null;
  /** Aggregate-safe summary only (ids/enums/counts). Sanitized; defaults to `{}`. */
  readonly metadata?: Record<string, unknown> | null;
}

/**
 * The injectable recorder seam. CS-5d injects an implementation into
 * `runAuthorizedCapability`; the default injection is the no-op recorder so the
 * agent core never hard-depends on the DB.
 *
 * `record` is FAIL-OPEN: it must resolve (never throw) on a persistence failure,
 * so an audit-write problem can never break the agent/user path.
 */
export interface ReactAgentAuditRecorder {
  record(input: ReactAgentAuditRecorderInput): Promise<void>;
}
