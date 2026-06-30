import { z } from "zod";

/**
 * Contract for React Agent APPLY MODES (REACT-AGENT-APPLY-MODES-1).
 *
 * When a React Agent edit preview is active, the user chooses HOW to apply it:
 *   - `preview_only`   — keep it as a preview; nothing is written to the draft.
 *   - `apply_to_draft` — add the change to the local draft (the existing apply;
 *                        no save / run / activate).
 *   - `apply_and_test` — apply to the draft, save it, then run a safe test —
 *                        offered only when readiness + testability allow it.
 *
 * The enum lives in `contracts/` (the lowest layer) so BOTH the pure
 * availability helper in `core/workflows/agentApplyModes.ts` AND the agent-change
 * history audit record (`contracts/agentChangeHistory.ts`) reference one source of
 * truth. The chosen mode is persisted in the agent-change history metadata so the
 * audit record knows the user's choice even if the rail/history UI is later removed.
 */

export const AGENT_APPLY_MODES = [
  "preview_only",
  "apply_to_draft",
  "apply_and_test",
] as const;

export const AgentApplyModeSchema = z.enum(AGENT_APPLY_MODES);
export type AgentApplyMode = z.infer<typeof AgentApplyModeSchema>;
