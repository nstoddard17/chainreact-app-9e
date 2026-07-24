import type { AiFeature } from "@/core/ai/modelTypes";
import { createFirstPartyProcessorClient } from "./firstPartyClient";
import { createGatewayProcessorClient, type GatewayFetch } from "./gatewayClient";
import type { AiProcessorClient, ModelRoute } from "./types";

/**
 * Client factory (AI-PROVIDER-2 CS-2): turn a resolved `ModelRoute` into
 * the concrete `AiProcessorClient`. Callers other than `executeAiAction`
 * should not construct clients directly.
 *
 * `feature` (AI-PROVIDER-3 CS-3) is the registry-declared capability key.
 * The gateway path doesn't need it (the gateway owns vendor selection);
 * the first-party path uses it for the model layer's default tier and
 * telemetry tagging.
 */
export interface CreateAiProcessorClientDeps {
  /** Test seam for the gateway path. */
  readonly fetchImpl?: GatewayFetch;
}

export function createAiProcessorClient(
  route: ModelRoute,
  feature: AiFeature,
  deps: CreateAiProcessorClientDeps = {},
): AiProcessorClient {
  if (route.provider === "first_party") {
    return createFirstPartyProcessorClient({ feature, tier: route.tier });
  }
  return createGatewayProcessorClient(
    deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {},
  );
}
