import type { ActionHandler } from "@/services/execution/handlers/types";
import { runDataTransform } from "@/services/ai/processor/runDataTransform";
import { TransformDataConfigSchema } from "./transformData.schema";

/**
 * ChainReact AI — `ai:transform_data` (AI-PROVIDER-6 CS-6).
 *
 * Maps structured data from whatever shape an earlier step produced into the
 * shape the next step expects. The primary path (owner decision 10) is
 * "transform into another ChainReact action's fields": the author picks the
 * destination step, and the schema is DERIVED from that action's own declared
 * metadata instead of being retyped by hand.
 *
 * Thin by construction, exactly like `ai:analyze_document`: parse the strict
 * config, delegate, return a bounded output. Input classification lives in
 * `core/workflows/transformInput.ts`, destination derivation in
 * `core/workflows/deriveDestinationContext.ts` +
 * `services/ai/processor/resolveTransformDestination.ts`, and billing /
 * gating / routing / ledger live once in `executeAiAction`.
 *
 * Failure posture: throws; the engine classifies (`HANDLER_FAILED`, or
 * `TRANSIENT_PROVIDER_ERROR` for retry-worthy stops).
 */
export const transformData: ActionHandler = async (input) => {
  const config = TransformDataConfigSchema.parse(input.config);

  const output = await runDataTransform({
    config: {
      input: config.input,
      destinationMode: config.destinationMode,
      destinationAction: config.destinationAction,
      destinationSchema: config.destinationSchema,
      outputShape: config.outputShape,
      instructions: config.instructions,
      confidenceThreshold: config.confidenceThreshold,
      onLowConfidence: config.onLowConfidence,
      strictValidation: config.strictValidation,
      maxRows: config.maxRows,
      modelQuality: config.modelQuality,
    },
    accountId: input.accountId,
    userId: input.userId,
    workflowId: input.workflowId,
    runId: input.runId,
    nodeId: input.nodeId,
    ...(input.testMode !== undefined ? { testMode: input.testMode } : {}),
  });

  return { output };
};
