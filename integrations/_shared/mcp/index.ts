/**
 * Shared MCP client — public surface. Provider code imports from here, not the
 * individual modules. Inaugural consumer: Eden (`integrations/_shared/eden/`).
 */
export { McpClient, createMcpClient, readStructuredError, MCP_PROTOCOL_VERSION } from "./client";
export type { McpClientOptions, CallToolOptions, FetchLike, FetchLikeResponse } from "./client";
export { detectSchemaDrift } from "./drift";
export type { SchemaDriftResult } from "./drift";
// CS-4 MCP-DRIFT — drift classification + internal review report.
export {
  classifyToolDrift,
  diffSchemaFields,
  driftToCertificationState,
  driftAllowsExecution,
  buildDriftReport,
  findingStateInfo,
} from "./driftClassify";
export type {
  DriftClassification,
  SchemaFieldDiff,
  ToolDriftFinding,
  DriftReport,
} from "./driftClassify";
// CS-4 MCP-DRIFT — short-TTL live-tools cache.
export {
  getLiveTools,
  invalidateSchemaCache,
  clearSchemaCache,
  schemaCacheStats,
  DEFAULT_SCHEMA_CACHE_TTL_MS,
} from "./schemaCache";
export type { GetLiveToolsInput, GetLiveToolsResult } from "./schemaCache";
export { tokenFingerprint, scrubSecrets } from "./sanitize";
// CS-1 MCP-AUTH — shared OAuth 2.1 helper for MCP-catalog providers.
export { createMcpProviderOAuth } from "./oauth";
export type {
  McpProviderOAuthConfig,
  McpOAuthEndpoints,
  McpOAuthTokenResponse,
} from "./oauth";
export {
  discoverProtectedResource,
  discoverAuthorizationServer,
  discoverForResource,
  canonicalResourceUri,
  clearMcpOAuthDiscoveryCache,
  McpOAuthDiscoveryError,
} from "./oauthDiscovery";
export type {
  ProtectedResourceMetadata,
  AuthorizationServerMetadata,
} from "./oauthDiscovery";
export {
  McpError,
  McpAuthError,
  McpPermissionError,
  McpToolNotFoundError,
  McpRateLimitError,
  McpTransportError,
  McpProtocolError,
  McpSchemaDriftError,
} from "./errors";
export type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
  McpListToolsResult,
  McpCallToolResult,
  McpContentBlock,
  McpInitializeResult,
  McpListResourcesResult,
  McpListPromptsResult,
} from "./types";
