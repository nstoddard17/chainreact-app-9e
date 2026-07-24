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
