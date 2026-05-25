/**
 * Deterministic WorkflowPatch preview service (Slice 4.AI-5).
 *
 * Read-only "what would change" view composed over the AI-3 validator and the
 * AI-4 explainer. No model calls, no DB writes, no patch apply, no UI. See
 * docs/slices/phase-4/ai-architecture-react-agent-plan.md §6.
 */

export { previewWorkflowPatchForAI } from "./previewWorkflowPatch";
export type {
  PreviewWorkflowPatchInput,
  PatchPreviewResult,
  PatchChangeSummary,
  PreviewValidation,
} from "./types";
