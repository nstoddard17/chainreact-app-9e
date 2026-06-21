/**
 * Shared AI result-rendering views (Slice 4.AI-14).
 *
 * HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT (2026-06-21): the legacy builder chat subtree
 * (BuilderAiPanel + its hooks + the chat-only `ai/*` helpers) was removed. The only
 * remaining LIVE consumer of this module is the run-results repair block
 * (`RunResultsRepairBlock`), which renders these two small, self-contained views. The
 * chat-only helpers (composeFollowUpPrompt, deterministicCompletion, chatFill*,
 * setup/attention findings, RequiredInputControl, etc.) were deleted with the chat.
 */

export { AiBulletList } from "./AiBulletList";
export type {
  AiBulletListProps,
  AiBulletSeverity,
} from "./AiBulletList";

export { AiRequiredInputList } from "./AiRequiredInputList";
export type {
  AiRequiredInputItem,
  AiRequiredInputListProps,
  AiRequiredInputVariant,
} from "./AiRequiredInputList";
