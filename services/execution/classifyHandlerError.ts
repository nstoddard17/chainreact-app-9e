import type { RunFailureCode } from "./engineTypes";

/**
 * Handler-throw → `RunFailureCode` normalization.
 *
 * Extracted from `engine.ts` (5.TRUCK-BRIDGE-1 CS-4, max-lines budget) as a
 * PURE function with no behavior change — the same chain, in the same order,
 * with the same fallback.
 *
 * ── Why `err.name` and not `instanceof` ────────────────────────────────────
 * The error classes live in `services/oauth/refreshAndRetry`, the MCP compile
 * layer, the AI layer, and `integrations/fleetio`. Importing them here would
 * create import cycles back into `services/execution`, so each class sets a
 * STABLE `name` and this module matches on that. Renaming any of those classes
 * silently degrades a run to `HANDLER_FAILED`, which is why each mapping has a
 * test that throws the REAL class rather than a hand-set name.
 *
 * ── What the codes are for ─────────────────────────────────────────────────
 * Each first-class code exists because its user-facing next step differs:
 * reconnect the app, grant a permission, wait and retry, add credits, review a
 * changed interface, or link a vehicle. Anything unrecognized falls back to
 * `HANDLER_FAILED`, whose humanized copy is deliberately generic — the raw
 * thrown message can carry tokens, emails, provider account ids, or raw
 * provider bodies, so it is kept on the step for SERVER-SIDE diagnostics only
 * and never echoed into the persisted classification.
 */
export function classifyHandlerError(err: unknown): RunFailureCode {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    // CR-FAILREASON-1 — provider auth failed or the connection needs the user.
    case "Unauthorized401Error":
    case "IntegrationActionRequiredError":
      return "INTEGRATION_REAUTH_REQUIRED";
    // CR-FAILREASON-1 — 403 for a missing scope; only re-consent fixes it.
    case "InsufficientScopeError":
      return "INTEGRATION_SCOPE_REQUIRED";
    // CR-FAILREASON-1 — timeout / aborted request; retrying usually succeeds.
    case "AbortError":
    case "TimeoutError":
      return "TRANSIENT_PROVIDER_ERROR";
    // TRUCK-BRIDGE-1 CS-4 — the step needed a vehicle link this account has not
    // confirmed (or has removed). A setup gap with a specific fix, not a handler
    // bug, so the humanizer can name Apps → Vehicle Links.
    case "UnmappedVehicleError":
      return "UNMAPPED_VEHICLE";
    // CS-4 MCP-DRIFT — a connected app changed its interface in a way ChainReact
    // has not reviewed; the engine stopped BEFORE sending data. Safe stop.
    case "McpSchemaDriftError":
      return "INTEGRATION_CHANGED";
    // AI-PROVIDER-6 — a ChainReact AI step refused for lack of AI credits, so
    // run history points at billing rather than at the step's configuration.
    case "AiCreditsExhaustedError":
      return "AI_CREDITS_EXHAUSTED";
    // EXCEL-UPDATE-ROW-CONCURRENCY-4 — the document is in use by somebody
    // else. Deliberately NOT `TRANSIENT_PROVIDER_ERROR`: that code's whole
    // meaning is "retrying usually succeeds", and retrying a locked workbook
    // is the one thing Microsoft documents clients must not do.
    case "WorkbookConflictError":
      return "PROVIDER_CONFLICT";
    default:
      return "HANDLER_FAILED";
  }
}
