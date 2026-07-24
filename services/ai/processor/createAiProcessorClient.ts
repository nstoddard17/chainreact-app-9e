import { createFirstPartyProcessorClient } from "./firstPartyClient";
import { createGatewayProcessorClient, type GatewayFetch } from "./gatewayClient";
import type { AiProcessorClient, ModelRoute } from "./types";

/**
 * Client factory (AI-PROVIDER-2 CS-2): turn a resolved `ModelRoute` into
 * the concrete `AiProcessorClient`. Callers other than `executeAiAction`
 * should not construct clients directly.
 */
export interface CreateAiProcessorClientDeps {
  /** Test seam for the gateway path. */
  readonly fetchImpl?: GatewayFetch;
}

export function createAiProcessorClient(
  route: ModelRoute,
  deps: CreateAiProcessorClientDeps = {},
): AiProcessorClient {
  if (route.provider === "first_party") {
    return createFirstPartyProcessorClient({ tier: route.tier });
  }
  return createGatewayProcessorClient(
    deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {},
  );
}
