/**
 * React Agent audit recorder — no-op (REACT-AGENT-CS-5C-AUDIT-RECORDER).
 *
 * The DEFAULT injection for `runAuthorizedCapability` and the default in tests:
 * it accepts the same safe input and does nothing, successfully. This keeps the
 * agent core free of any hard DB dependency — emission only happens when a caller
 * (the gated route, CS-5d) explicitly injects the live recorder. A no-op recorder
 * is preferable to an optional/undefined recorder because the seam can always call
 * `recorder.record(...)` unconditionally.
 */

import type {
  ReactAgentAuditRecorder,
  ReactAgentAuditRecorderInput,
} from "./types";

export const noopReactAgentAuditRecorder: ReactAgentAuditRecorder = {
  async record(_input: ReactAgentAuditRecorderInput): Promise<void> {
    // Intentionally does nothing — no persistence, no side effects.
  },
};
