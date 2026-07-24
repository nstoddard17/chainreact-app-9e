/**
 * ChainReact AI processor — the platform layer every AI action executes
 * through (AI-PROVIDER-2 CS-2). See the CS-2 outcome doc:
 * docs/slices/phase-5/ai-provider-cs2-processor-outcome.md
 */
export type {
  AiProcessorClient,
  AiProcessorFailureCode,
  AiProcessorProvider,
  AiProcessorUsage,
  AiProcessRequest,
  AiProcessResult,
  AnalyzeDocumentProcessRequest,
  ModelRoute,
  SuggestSchemaProcessRequest,
  TransformDataProcessRequest,
} from "./types";
export {
  AI_PROCESSOR_ENV,
  describeAiProcessorConfigStatus,
  describeAiProcessorRolloutReadiness,
  getAiProcessorConfig,
  isAiProcessorEnabled,
  type AiProcessorConfig,
  type AiProcessorConfigStatus,
  type AiProcessorRolloutReadiness,
} from "./config";
export {
  AI_ACTION_REGISTRY,
  getAiActionRegistryEntry,
  listAiActionRegistryEntries,
  type AiActionKey,
  type AiActionRegistryEntry,
  type AiProviderFeature,
} from "./aiActionRegistry";
export { createAiProcessorClient } from "./createAiProcessorClient";
export { createGatewayProcessorClient } from "./gatewayClient";
export { createFirstPartyProcessorClient } from "./firstPartyClient";
export { resolveModelRoute, type ResolveModelRouteInput } from "./resolveModelRoute";
export {
  executeAiAction,
  type AiActionLedger,
  type ExecuteAiActionDeps,
  type ExecuteAiActionInput,
  type ExecuteAiActionOutcome,
} from "./executeAiAction";
export {
  AI_PROCESS_SCHEMA_VERSION,
  buildFirstPartyRequestShape,
  buildGatewayProcessBody,
  GATEWAY_MAX_BODY_BYTES,
  GATEWAY_PROCESS_PATH,
} from "./requestShapes";
export { outputJsonSchemaFor, resultValidatorFor } from "./responseSchemas";
// AI-PROVIDER-5 (CS-5) — Analyze Document orchestration + the extraction
// validator both actions share.
export {
  AiActionRefusedError,
  AiCreditsExhaustedError,
  AiTransientError,
  DestinationResolutionError,
  DocumentInputError,
  ExtractionValidationError,
  refusalError,
  TransformInputError,
} from "./analysisErrors";
export {
  blankLowConfidenceRows,
  coerceSchemaValue,
  validateExtractedFields,
  validateExtractedRows,
  validateTransformedRecord,
  type ExtractionValidation,
  type ExtractionValidatorOptions,
  type ValidatedFields,
  type ValidatedRows,
} from "./extractionValidator";
export {
  MAX_OUTPUT_TOKENS,
  resolveAnalysisDocument,
  type ResolveAnalysisDocumentDeps,
  type ResolveAnalysisDocumentInput,
  type ResolvedAnalysisDocument,
} from "./resolveAnalysisDocument";
// AI-PROVIDER-7 (CS-7) — builder-time schema suggestion.
export {
  MAX_SUGGESTED_FIELDS,
  runSchemaSuggestion,
  SUGGEST_SCHEMA_ACTION_KEY,
  type RunSchemaSuggestionDeps,
  type RunSchemaSuggestionInput,
  type SchemaSuggestionOutcome,
} from "./runSchemaSuggestion";
// AI-PROVIDER-6 (CS-6) — Transform Data orchestration + destination resolution.
export {
  DESTINATION_EXCLUDED_WARNING_PREFIX,
  destinationWarnings,
  resolveTransformDestination,
  type ResolvedTransformDestination,
  type ResolveTransformDestinationDeps,
  type ResolveTransformDestinationInput,
} from "./resolveTransformDestination";
export {
  runDataTransform,
  TRANSFORM_DATA_ACTION_KEY,
  type DataTransformOutput,
  type RunDataTransformConfig,
  type RunDataTransformDeps,
  type RunDataTransformInput,
} from "./runDataTransform";
export {
  ANALYZE_DOCUMENT_ACTION_KEY,
  runDocumentAnalysis,
  tierForModelQuality,
  type DocumentAnalysisOutput,
  type RunDocumentAnalysisConfig,
  type RunDocumentAnalysisDeps,
  type RunDocumentAnalysisInput,
} from "./runDocumentAnalysis";
