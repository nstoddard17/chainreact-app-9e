import type { ModelTier } from "@/core/ai/modelTypes";
import type { AiProcessorTask } from "@/contracts/aiProcessing";
import { getAiProcessorConfig } from "./config";
import type { ModelRoute } from "./types";

/**
 * Model-routing seam (AI-PROVIDER-2 CS-2, plan decision 14).
 *
 * The single place that decides WHICH implementation (and later, which
 * model family) serves an AI-processor call. Workflow handlers request a
 * task; they never select vendors or model names — the model actually
 * used is reported back via `modelTag` for telemetry/ledger attribution.
 *
 * Phase 1 is deliberately trivial: honor `AI_PROCESSOR_PROVIDER` for
 * every feature. The signature carries feature/tier/task NOW so future
 * per-feature routing (e.g. document_analysis → gateway/Claude,
 * sql_generation → first-party/GPT, image_understanding → Gemini) lands
 * HERE as config/policy — with zero changes to actions, the registry, or
 * the wire contract.
 */
export interface ResolveModelRouteInput {
  /** The AI credit feature key (registry-declared). */
  readonly feature: string;
  readonly tier: ModelTier;
  readonly task: AiProcessorTask;
}

export function resolveModelRoute(input: ResolveModelRouteInput): ModelRoute {
  const config = getAiProcessorConfig();
  // Disabled/unconfigured still resolves a nominal route — the CLIENT is
  // the enforcement point (returns DISABLED / NOT_CONFIGURED, no network).
  const provider = config?.provider ?? "gateway";
  // `feature`/`task` are intentionally unused in phase 1 — they are the
  // future routing dimensions this seam exists to receive.
  void input.feature;
  void input.task;
  return { provider, tier: input.tier };
}
