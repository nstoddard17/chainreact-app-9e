import { z } from "zod";

/**
 * Cross-layer contracts for React Agent conversation persistence.
 *
 * Lives in `contracts/` so both the service-layer sanitizer
 * (`services/ai/builderAgent/sanitizeAgentMessage.ts`) and the repository
 * (`repositories/builderAgentThreads.ts`) can reference the same shape
 * without the repository importing from `services/` (forbidden by
 * docs/rules/project-structure-and-module-boundaries.md §4).
 *
 * The shape mirrors the `builder_agent_messages` row; the role / kind enums
 * match the table's CHECK constraints.
 *
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 extended the original Slice 4.AI-23
 * shape with the fields the CURRENT React Agent transcript needs to be restored
 * honestly:
 *   - `review` joins the kind whitelist (the deterministic, credit-free
 *     "Check workflow" turn),
 *   - `clientMessageId` makes a duplicated write idempotent,
 *   - `requestId` correlates the user turn with the assistant turn it produced,
 *   - `agentChangeId` REFERENCES the canonical proposal-lifecycle record in
 *     `agent_change_history` (status is read from there, never copied here),
 *   - `baseGraphVersion` pins the proposal to the draft revision it was built
 *     against, so a restored proposal can be reconciled against the saved
 *     workflow as it stands now,
 *   - `proposal` carries the sanitized structured proposal/preview data.
 *
 * A guided STAGE is deliberately absent from this contract: the stage is always
 * derived from the saved workflow + current readiness, never restored.
 */

export type AgentMessageRole = "user" | "assistant";

export type AgentMessageKind =
  | "prompt"
  | "followup"
  | "plan_result"
  | "needs_input"
  | "applied"
  | "apply_failure"
  | "error"
  | "system_notice"
  | "review";

/**
 * Output of the sanitizer; the only shape the repository's
 * `appendMessageForWorkflow` accepts. By keeping this type here (not in
 * `services/`), repositories can satisfy the module-boundary lint while still
 * statically depending on the sanitized contract.
 */
export interface SanitizedAgentMessage {
  readonly role: AgentMessageRole;
  readonly kind: AgentMessageKind;
  readonly content: string | null;
  readonly safePayload: Readonly<Record<string, unknown>>;
  /** Idempotency key minted by the client for this logical turn. */
  readonly clientMessageId: string | null;
  /** The request that produced this turn (user turn + its assistant reply share it). */
  readonly requestId: string | null;
  /** Reference to `agent_change_history.agent_change_id`, when this turn carries a proposal. */
  readonly agentChangeId: string | null;
  /** The draft revision the proposal was validated against. */
  readonly baseGraphVersion: string | null;
  /** Sanitized structured proposal/preview data, or null. */
  readonly proposal: Readonly<Record<string, unknown>> | null;
}

/** Max stored length for the reference-ish string columns (mirrors the DB CHECK). */
export const AGENT_MESSAGE_REF_MAX = 128;

/** Hard cap on the serialized `proposal` payload; over-cap proposals are stored preview-only. */
export const AGENT_MESSAGE_PROPOSAL_MAX_BYTES = 96_000;

/** Mirrors the migration's content CHECK. */
export const AGENT_MESSAGE_CONTENT_MAX = 8_000;

/** Cap on how many stored turns one thread read returns. */
export const AGENT_THREAD_MESSAGE_LIMIT = 200;

// ── API DTOs (route ⇄ typed client) ─────────────────────────────────────────

const AGENT_MESSAGE_ROLES = ["user", "assistant"] as const;
const AGENT_MESSAGE_KINDS = [
  "prompt",
  "followup",
  "plan_result",
  "needs_input",
  "applied",
  "apply_failure",
  "error",
  "system_notice",
  "review",
] as const;

/**
 * POST body for appending one turn. Every field is client-supplied and therefore
 * untrusted: the route re-runs the server-side sanitizer before anything reaches
 * the repository, and `user_id` / `workflow_id` are set from the authenticated
 * session + route param, never from this body.
 */
export const AppendAgentMessageRequestSchema = z.object({
  role: z.enum(AGENT_MESSAGE_ROLES),
  kind: z.enum(AGENT_MESSAGE_KINDS),
  content: z.string().max(AGENT_MESSAGE_CONTENT_MAX).nullish(),
  safePayload: z.record(z.string(), z.unknown()).nullish(),
  clientMessageId: z.string().trim().min(1).max(AGENT_MESSAGE_REF_MAX).optional(),
  requestId: z.string().trim().min(1).max(AGENT_MESSAGE_REF_MAX).optional(),
  agentChangeId: z.string().uuid().optional(),
  baseGraphVersion: z.string().trim().min(1).max(AGENT_MESSAGE_REF_MAX).optional(),
  proposal: z.record(z.string(), z.unknown()).nullish(),
});
export type AppendAgentMessageRequest = z.infer<typeof AppendAgentMessageRequestSchema>;

/** One restored turn as the client sees it. */
export interface PersistedAgentMessage {
  readonly id: string;
  readonly role: AgentMessageRole;
  readonly kind: AgentMessageKind;
  readonly content: string | null;
  readonly safePayload: Readonly<Record<string, unknown>>;
  readonly clientMessageId: string | null;
  readonly requestId: string | null;
  readonly agentChangeId: string | null;
  readonly baseGraphVersion: string | null;
  readonly proposal: Readonly<Record<string, unknown>> | null;
  readonly createdAt: string;
}

export interface AgentThreadSummary {
  readonly id: string;
  readonly workflowId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GetAgentThreadResponse {
  readonly thread: AgentThreadSummary | null;
  readonly messages: readonly PersistedAgentMessage[];
}
