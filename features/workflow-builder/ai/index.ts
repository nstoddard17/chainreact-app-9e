/**
 * Shared AI result-rendering views (Slice 4.AI-14).
 *
 * Consumed by both the Builder AI panel (planner / preview / apply) and the
 * failed-run repair block. Surface-specific structure (cards, disclosures,
 * apply buttons, copy) stays in each consumer — these are the small pieces
 * with real, repeated rendering logic, extracted to eliminate drift.
 *
 * Intentionally NOT extracted (each surface owns its own version):
 *   - Preview summary card — Builder shows full validation/risk/cost; Repair
 *     shows a minimal `<details>` disclosure. Different scope per surface.
 *   - Apply state messages — copy is surface-specific
 *     ("Plan another change" vs "Re-run the workflow to verify").
 *   - Risk acknowledgement vs in-button confirmation — different mental
 *     models, different UX.
 *
 * See docs/slices/phase-4/ai-architecture-react-agent-plan.md AI-14 note.
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
