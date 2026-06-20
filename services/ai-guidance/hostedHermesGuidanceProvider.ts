/**
 * Hosted Hermes guidance adapter — SKELETON (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * The future hosted Nous Hermes Workflow Guidance Brain plugs in HERE, behind the
 * provider-neutral `WorkflowGuidanceProvider` port. This slice ships the GATING + CONFIG
 * reading only — it deliberately ships NO transport, so it can NEVER make a live network
 * call. The decision tree is fully testable without any real env:
 *
 *   flag OFF (default)          → PROVIDER_DISABLED        (no config read, no call)
 *   flag ON, HERMES_* missing   → PROVIDER_NOT_CONFIGURED  (no call)
 *   flag ON, configured, no xport → PROVIDER_NOT_CONFIGURED (no call — this foundation slice)
 *   flag ON, configured, +xport → delegates to the injected transport (the future slice)
 *
 * A later slice wires a real `HermesGuidanceTransport` that POSTs the de-identified
 * `WorkflowGuidanceRequest` to `config.baseUrl` (Authorization: Bearer `config.apiKey`,
 * model `config.model`, `config.providerFormat`, AbortController timeout `config.timeoutMs`)
 * and maps the response into the safe `GuidanceResult`. It is injected (not hard-imported)
 * so this module never pulls a network client at module load.
 */

import type { GuidanceResult, WorkflowGuidanceProvider, WorkflowGuidanceRequest } from "./types";
import { isHostedHermesGuidanceEnabled } from "./flags";
import { getHermesGuidanceConfig, type HermesGuidanceConfig } from "./hermesConfig";

/**
 * The network seam. The future slice provides this; it receives the ALREADY-SANITIZED
 * request + resolved config and returns a safe `GuidanceResult`. Absent → no live call.
 */
export type HermesGuidanceTransport = (
  request: WorkflowGuidanceRequest,
  config: HermesGuidanceConfig,
) => Promise<GuidanceResult>;

export interface HostedHermesGuidanceDeps {
  /** Injected by a later slice. Omitted (this slice) → the adapter can make no live call. */
  readonly transport?: HermesGuidanceTransport;
}

export function createHostedHermesGuidanceProvider(
  deps: HostedHermesGuidanceDeps = {},
): WorkflowGuidanceProvider {
  return {
    providerId: "hermes",
    async getWorkflowGuidance(request) {
      if (!isHostedHermesGuidanceEnabled()) return { ok: false, code: "PROVIDER_DISABLED" };
      const config = getHermesGuidanceConfig();
      if (!config) return { ok: false, code: "PROVIDER_NOT_CONFIGURED", reason: "missing HERMES_* env" };
      if (!deps.transport) {
        return { ok: false, code: "PROVIDER_NOT_CONFIGURED", reason: "transport not wired (foundation slice)" };
      }
      return deps.transport(request, config);
    },
  };
}

/** Default instance — NO transport → never makes a live call. Safe to import anywhere. */
export const hostedHermesGuidanceProvider: WorkflowGuidanceProvider = createHostedHermesGuidanceProvider();
