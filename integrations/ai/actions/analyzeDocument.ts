import type { ActionHandler } from "@/services/execution/handlers/types";
import { runDocumentAnalysis } from "@/services/ai/processor/runDocumentAnalysis";
import { AnalyzeDocumentConfigSchema } from "./analyzeDocument.schema";

/**
 * ChainReact AI — `ai:analyze_document` (AI-PROVIDER-5 CS-5).
 *
 * The first AI capability that executes INSIDE a workflow run. Five modes
 * (summarize · extract fields · extract rows · classify · answer a
 * question) share one action, because they share one input, one billing
 * feature, and one output surface — splitting them would make an author
 * relearn the same node five times.
 *
 * The handler is deliberately thin, per plan §4.2: parse the strict config,
 * delegate, return a bounded output. Document resolution lives in
 * `resolveAnalysisDocument`, the model call + billing + gating + routing +
 * ledger live in `executeAiAction`, and validation lives in the extraction
 * validator. There is no handler-local billing path to drift.
 *
 * Failure posture: throws; the engine classifies (`HANDLER_FAILED`, or
 * `TRANSIENT_PROVIDER_ERROR` for the retry-worthy stops — see
 * `analysisErrors.ts`). No `{success:false}` envelope.
 */
export const analyzeDocument: ActionHandler = async (input) => {
  const config = AnalyzeDocumentConfigSchema.parse(input.config);

  const output = await runDocumentAnalysis({
    config: {
      file: config.file,
      mode: config.mode,
      instructions: config.instructions,
      expectedFields: config.expectedFields,
      rowSchema: config.rowSchema,
      labels: config.labels,
      allowOtherLabel: config.allowOtherLabel,
      question: config.question,
      pageRange: config.pageRange,
      sheetName: config.sheetName,
      maxPages: config.maxPages,
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
