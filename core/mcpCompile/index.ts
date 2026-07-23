/**
 * MCP schema compiler (CS-2 MCP-COMPILER) — public surface.
 * Pure: JSON in → validated metadata + emitted TypeScript source out.
 * I/O lives in `scripts/mcp-import`.
 */
export { compileProvider, compileAction, classifyToolRisk } from "./compileAction";
export { compileFields, humanizeFieldName } from "./compileFields";
export { emitProviderArtifacts, emitSchemaSource, emitMetaSource, emitHandlerSource, emitPinnedSchemas, tsLiteral, camelCase, pascalCase } from "./emit";
export type { EmittedFile } from "./emit";
// CS-5A — registration-plan output (copy/paste inventory fragments; never edits).
export { buildRegistrationPlan, renderRegistrationPlan } from "./registrationPlan";
export type { RegistrationPlan, RegistrationFragment } from "./registrationPlan";
export { readSchemaNode, canonicalJson, schemaHash } from "./jsonSchema";
export {
  McpCatalogSchema,
  McpToolSnapshotFileSchema,
  McpCapabilityReportSchema,
  McpCapabilityProfileSchema,
  McpRiskClassificationSchema,
  McpEvidenceApprovalSchema,
  McpWriteEvidenceApprovalSchema,
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
  McpEvidenceApproval,
  McpRiskClassification,
  McpSnapshotTool,
  McpToolSnapshotFile,
} from "./types";
