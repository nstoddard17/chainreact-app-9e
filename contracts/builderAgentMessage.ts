/**
 * Cross-layer contracts for Builder Agent chat persistence (Slice 4.AI-23).
 *
 * Lives in `contracts/` so both the service-layer sanitizer
 * (`services/ai/builderAgent/sanitizeAgentMessage.ts`) and the repository
 * (`repositories/builderAgentThreads.ts`) can reference the same shape
 * without the repository importing from `services/` (forbidden by
 * docs/rules/project-structure-and-module-boundaries.md §4).
 *
 * The shape mirrors the `builder_agent_messages` row's content + safe_payload
 * columns; the role / kind enums match the table's CHECK constraints + the
 * UI's session-local `ChatMessage` taxonomy.
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
  | "system_notice";

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
}
