/**
 * Runtime model-client layer (Slice 4.AI-8C) — public surface.
 *
 * Real `ModelClient` implementations + a fail-safe runtime factory that turns
 * `core/ai/models` config + env into a concrete client. NO live calls in tests
 * (the adapter's fetch is injectable); NO workflow mutation; NO apply.
 *
 * See docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1.
 */

export { createAnthropicModelClient } from "./anthropicClient";
export {
  createModelClientForFeature,
  createModelClientForModel,
  createRuntimeModelClient,
} from "./createModelClient";
export type {
  AnthropicModelClientOptions,
  RuntimeModelClientInput,
} from "./types";
