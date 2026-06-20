/**
 * No-op workflow-guidance provider (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * The DEFAULT provider + the test default. It produces no guidance and makes no call —
 * `PROVIDER_DISABLED`. The intake service falls back to this whenever no live provider is
 * injected, so the foundation is fully wired end-to-end while remaining completely inert.
 */

import type { WorkflowGuidanceProvider } from "./types";

export const noopWorkflowGuidanceProvider: WorkflowGuidanceProvider = {
  providerId: "noop",
  async getWorkflowGuidance() {
    return { ok: false, code: "PROVIDER_DISABLED" };
  },
};
