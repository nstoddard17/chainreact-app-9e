/**
 * React Agent audit recorder — types (REACT-AGENT-CS-5C / CS-5D).
 *
 * The recorder CONTRACT (`ReactAgentAuditRecorder`, `ReactAgentAuditRecorderInput`,
 * `ReactAgentAuditOutcome`) lives in the boundary core (`../types`) so
 * `runAuthorizedCapability` can reference it WITHOUT importing this DB-backed
 * submodule — keeping the core import-safe. This file simply re-exports that
 * contract (plus the `ReactAgentAuditMode` alias) as the audit module's public
 * surface; the IMPLEMENTATION (which imports the DB repository) lives alongside.
 *
 * NO-LEAK CONTRACT (mirrors the ledger + `ai_cost_events`): the recorder persists
 * only ids, registry enums, safe reason/opaque-ref strings, the cost-event link,
 * and a sanitized aggregate-safe `metadata` object — never raw prompts, model
 * answers, secrets, tokens, raw provider payloads, or raw workflow config.
 */

export type {
  ReactAgentAuditOutcome,
  ReactAgentAuditRecorder,
  ReactAgentAuditRecorderInput,
} from "../types";
/** The capability mode union, re-exported under the audit-facing name. */
export type { ReactAgentCapabilityMode as ReactAgentAuditMode } from "../capabilities";
