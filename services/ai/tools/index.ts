/**
 * AI metadata / context tool layer (Slice 4.AI-2).
 *
 * The deterministic, read-only grounding surface the future React Agent
 * (Slice 4.AI-3+) calls. No model calls, no patch engine, no UI, no mutation.
 * See docs/slices/phase-4/ai-architecture-react-agent-plan.md §5.
 *
 * Server-side only (composes services/ + repositories/). Every tool returns
 * an `AiToolResult<T>` (typed success/error, never null/undefined ambiguity)
 * and never emits tokens, secrets, PII, or raw run-data values.
 */

export {
  aiToolOk,
  aiToolErr,
  type AiToolResult,
  type AiToolSuccess,
  type AiToolError,
  type AiToolErrorCode,
  MAX_OPTIONS_QUERY_LENGTH,
  MAX_OPTIONS_ITEMS,
  MAX_AVAILABLE_VARIABLES,
  MAX_OUTPUT_FLATTEN_DEPTH,
} from "./types";

export { isSecretKey, redactSecrets, REDACTED } from "./redact";

export {
  getProviderCatalog,
  getActionMeta,
  getTriggerMeta,
  getNodeSchema,
  type ProviderCatalogView,
  type ProviderCatalogEntry,
  type CatalogActionEntry,
  type CatalogConfigField,
  type CatalogOutputField,
  type CatalogTriggerEntry,
  type ActionMetaView,
  type TriggerMetaView,
  type NodeSchemaView,
  type NodeOptionsSourceDep,
  type NodeRiskView,
} from "./providerCatalog";

export {
  resolveOptionsSourceForAI,
  type ResolveOptionsInput,
  type ResolveOptionsView,
} from "./options";

export {
  getConnectedIntegrationsForAI,
  type ConnectedIntegrationView,
  type ConnectedIntegrationsView,
} from "./integrations";

export {
  getWorkflowGraphForAI,
  getWorkflowSummaryForAI,
  getWorkflowValidationStateForAI,
  type WorkflowGraphView,
  type WorkflowGraphNodeView,
  type WorkflowSummaryView,
  type TriggerSummaryView,
  type ActionSummaryView,
  type HighRiskNodeView,
  type UnknownNodeView,
  type ValidationStateView,
  type ValidationIssue,
  type ValidationIssueCode,
  type ValidationSeverity,
} from "./workflowContext";

export {
  getAvailableVariablesForAI,
  type AvailableVariable,
  type AvailableVariablesView,
} from "./variables";
