/**
 * Typed client for the Builder AI routes (Slice 4.AI-11).
 *
 * This file is the STABLE PUBLIC BARREL — every consumer imports from
 * `@/lib/api/ai`. The implementation was split by capability in Slice
 * 4.AI-REPAIR-CLEANUP-1 (refactor only, no behavior change); each module lives
 * under `lib/api/ai/`:
 *   - `./ai/shared`      — transport (`postStructured` / `fetchJson` / `AiApiError`)
 *                          + cross-capability symbols. Internal helpers
 *                          (`postStructured` / `fetchJson`) are intentionally NOT
 *                          re-exported here (they were module-private before).
 *   - `./ai/plan`        — `applyWorkflowPatch` (`…/ai/apply`) + apply/preview types. The
 *                          legacy `planWorkflow` / `completePlan` were removed in
 *                          HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 2.
 *   - `./ai/runRepair`   — failed-run repair CONTRACT TYPES only (the request fn + its
 *                          `…/runs/[runId]/ai/repair` route were retired in
 *                          HERMES-AGENT-RETIRE-LEGACY-REPAIR-ROUTE; the governed client is
 *                          `./ai/workflowRepair` → `/api/accounts/[id]/ai/workflow-repair`).
 *
 * Per project-structure-and-module-boundaries.md §4/§5: client code calls this
 * module, never the server services or `fetch()` from a component. These types
 * are CLIENT-OWNED views of the (already-sanitized) route responses — the client
 * may not import the `@/services/**` result types, and treats `proposedPatch` as
 * OPAQUE (forwarded to the apply route, never inspected or rendered).
 *
 * Both plan/apply routes return a STRUCTURED result body (with an `ok` boolean)
 * for handled outcomes — including the non-2xx "handled failure" statuses. The
 * client returns those structured bodies as results; it only THROWS `AiApiError`
 * for transport-level failures whose body has no `ok` (401 / 404 / 500 /
 * bad-request validation).
 */

export { AiApiError, AI_CREDITS_EXHAUSTED_MESSAGE } from "./ai/shared";
export type { AiOpaquePatch } from "./ai/shared";
export * from "./ai/plan";
export * from "./ai/runRepair";
export * from "./ai/guidance";
