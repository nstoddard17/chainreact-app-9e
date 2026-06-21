/**
 * Hermes Agent gateway — SERVER-ONLY public surface (HERMES-AGENT-PROD-CLIENT).
 *
 * Deliberately NOT re-exported from `services/ai-guidance/index.ts` (the generic, potentially
 * client-importable barrel). Server code imports the gateway client from here directly. A test
 * guards that no browser/client (`"use client"`) module imports this path.
 *
 * Nothing here is the app-runtime default: `resolveServerGuidanceProvider()` returns the gateway
 * provider only when `HERMES_AGENT_ENABLED=true` + config is present, otherwise the inert noop
 * provider. No route/UI consumes it yet.
 */

import type { WorkflowGuidanceProvider } from "../types";
import { noopWorkflowGuidanceProvider } from "../noopGuidanceProvider";
import { isHermesAgentEnabled, getHermesAgentGatewayConfig } from "./gatewayConfig";
import { createHermesAgentGatewayProvider, type HermesAgentGatewayDeps } from "./hermesAgentGatewayClient";

export {
  HERMES_AGENT_ENV,
  HERMES_AGENT_ENABLED_FLAG,
  HERMES_AGENT_REQUIRED_VARS,
  isHermesAgentEnabled,
  getHermesAgentGatewayConfig,
  describeHermesAgentConfigStatus,
  type HermesAgentGatewayConfig,
  type HermesAgentConfigStatus,
} from "./gatewayConfig";
export {
  buildGatewayGuidancePrompt,
  redactSecretsFromText,
  type BuildGatewayPromptInput,
} from "./buildGatewayGuidancePrompt";
export {
  requestHermesAgentGuidance,
  createHermesAgentGatewayProvider,
  type GatewayFetch,
  type GatewayHttpResponse,
  type HermesAgentGatewayDeps,
} from "./hermesAgentGatewayClient";

/**
 * Server-only resolver: the gateway provider when enabled + configured, else the inert noop.
 * Explicit opt-in for server callers — NOT wired into any route/UI in this slice. Returns noop
 * (never throws) so an unconfigured environment is safe.
 */
export function resolveServerGuidanceProvider(deps: HermesAgentGatewayDeps = {}): WorkflowGuidanceProvider {
  if (isHermesAgentEnabled() && getHermesAgentGatewayConfig()) {
    return createHermesAgentGatewayProvider(deps);
  }
  return noopWorkflowGuidanceProvider;
}
