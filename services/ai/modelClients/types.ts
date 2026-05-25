/**
 * Runtime model-client types (Slice 4.AI-8C).
 *
 * The runtime model-client layer lives in `services/` (not `core/`) because it
 * reads env vars, performs network I/O, and knows provider request/response
 * shapes — all of which `core/ai/` purity forbids. `core/ai/` still owns the
 * model CONFIG (ids, tiers, env-var NAMES) and the abstract `ModelClient` /
 * `ModelResult` contract; this layer implements that contract for real.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1.
 */

import type { AiFeature, ModelTier } from "@/core/ai/modelTypes";

/** Selector for {@link createRuntimeModelClient} — mirrors the planner's inputs. */
export interface RuntimeModelClientInput {
  readonly feature: AiFeature;
  /** Tier override; defaults to the feature's default tier (see core/ai/models). */
  readonly tier?: ModelTier;
}

/**
 * Options for the Anthropic adapter. `fetchImpl` is injectable so unit tests
 * drive the adapter with a mock and NEVER touch the network. `apiKey` lives only
 * in the closure — it is never returned, logged, or echoed in any result.
 */
export interface AnthropicModelClientOptions {
  readonly apiKey: string;
  /** Defaults to https://api.anthropic.com */
  readonly baseUrl?: string;
  /** Per-call timeout; defaults to DEFAULT_MODEL_BUDGET.timeoutMs. */
  readonly timeoutMs?: number;
  /** Injectable fetch (defaults to globalThis.fetch) — the test seam. */
  readonly fetchImpl?: typeof fetch;
  /** Anthropic API version header; defaults to a pinned stable version. */
  readonly anthropicVersion?: string;
}
