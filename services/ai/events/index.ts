/**
 * AI route event emission (Slice 4.AI-10) — public surface.
 *
 * Fail-open emission of plan/apply outcomes into the EXISTING `ai_cost_events`
 * ledger (COST-6) via the existing recorder (`services/billing/aiCostEvents`).
 * No new table, no new recorder/sanitizer, no UI. See
 * docs/slices/phase-4/ai-architecture-react-agent-plan.md §16.
 */

export {
  recordAiPlanOutcome,
  recordAiApplyOutcome,
  type AiRouteEventScope,
} from "./recordAiRouteEvents";
