/**
 * React Agent audit recorder — public surface (REACT-AGENT-CS-5C-AUDIT-RECORDER).
 *
 * The ONLY place callers import the recorder from. The React Agent core
 * (`services/ai/reactAgent/index.ts`) must NOT import this submodule — CS-5d
 * injects a recorder into `runAuthorizedCapability` from the gated route instead,
 * keeping the core import-safe (no DB / no service-role).
 */

export type {
  ReactAgentAuditRecorder,
  ReactAgentAuditRecorderInput,
  ReactAgentAuditMode,
  ReactAgentAuditOutcome,
} from "./types";
export {
  createReactAgentAuditRecorder,
  reactAgentAuditRecorder,
  type ReactAgentAuditRecorderDeps,
} from "./recordReactAgentAuditEvent";
export { noopReactAgentAuditRecorder } from "./noopReactAgentAuditRecorder";
