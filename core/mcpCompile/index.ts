/**
 * MCP schema compiler (CS-2 MCP-COMPILER) — public surface.
 * Pure: JSON in → validated metadata + emitted TypeScript source out.
 * I/O lives in `scripts/mcp-import`.
 */
export { compileProvider, compileAction, classifyToolRisk } from "./compileAction";
export { compileFields, humanizeFieldName } from "./compileFields";
export { emitProviderArtifacts, emitSchemaSource, emitMetaSource, emitHandlerSource, emitPinnedSchemas, tsLiteral, camelCase, pascalCase } from "./emit";
export type { EmittedFile } from "./emit";
export { readSchemaNode, canonicalJson, schemaHash } from "./jsonSchema";
export {
  McpCatalogSchema,
  McpToolSnapshotFileSchema,
  McpCapabilityReportSchema,
  McpCapabilityProfileSchema,
  McpRiskClassificationSchema,
  McpCompileError,
} from "./types";
export type {
  CompileDiagnostic,
  CompiledAction,
  CompiledProvider,
  McpCapabilityProfile,
  McpCapabilityReport,
  McpCatalog,
  McpCatalogTool,
  McpCatalogFieldOverride,
  McpRiskClassification,
  McpSnapshotTool,
  McpToolSnapshotFile,
} from "./types";
