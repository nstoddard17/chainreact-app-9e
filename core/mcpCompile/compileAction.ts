import { ActionMetaSchema, type ActionMeta, type OutputMeta } from "@/contracts/actionMeta";
import { compileFields } from "./compileFields";
import { readSchemaNode, schemaHash } from "./jsonSchema";
import {
  McpCapabilityReportSchema,
  McpCatalogSchema,
  McpCompileError,
  McpToolSnapshotFileSchema,
  type CompileDiagnostic,
  type CompiledAction,
  type CompiledProvider,
  type McpCapabilityProfile,
  type McpCatalog,
  type McpCatalogTool,
  type McpQualityGrade,
  type McpRiskClassification,
  type McpSnapshotTool,
  type McpToolSnapshotFile,
} from "./types";

/**
 * Action/provider compiler (CS-2): snapshot + approved catalog → validated
 * `ActionMeta` + field IR + capability quality profile per shipped tool.
 * Only `decision: "ship"` entries generate anything (the allowlist rule).
 */

// ─── Risk classification ─────────────────────────────────────────────────────

const RISK_RULES: ReadonlyArray<{ re: RegExp; cls: McpRiskClassification }> = [
  { re: /^(delete|remove|destroy|archive|cancel|revoke|purge)/, cls: "destructive" },
  { re: /(payment|invoice|refund|charge|billing|payout|subscription)/, cls: "financial" },
  { re: /(member|permission|role|admin|user_management|invite)/, cls: "administrative" },
  { re: /^(get|list|search|find|read|fetch|query|lookup|view)/, cls: "read" },
  { re: /^(create|add|update|set|send|post|move|assign|edit|upsert|save)/, cls: "write" },
];

/** Deterministic keyword classification; the catalog's human override wins. */
export function classifyToolRisk(toolName: string): McpRiskClassification {
  const n = toolName.toLowerCase();
  for (const rule of RISK_RULES) {
    if (rule.re.test(n)) return rule.cls;
  }
  return "unknown";
}

const RISK_LEVEL_BY_CLASS: Readonly<Record<McpRiskClassification, "low" | "medium" | "high">> = {
  read: "low",
  write: "medium",
  // Unknown verbs get the cautious middle tier until a human classifies them.
  unknown: "medium",
  financial: "high",
  administrative: "high",
  destructive: "high",
  blocked: "high",
};

// ─── Capability quality heuristics (deterministic, documented) ──────────────

const GRADE_ORDER: readonly McpQualityGrade[] = ["poor", "fair", "good", "excellent"];
function worseOf(a: McpQualityGrade, b: McpQualityGrade): McpQualityGrade {
  return GRADE_ORDER[Math.min(GRADE_ORDER.indexOf(a), GRADE_ORDER.indexOf(b))]!;
}

function gradeSchemaQuality(
  tool: McpSnapshotTool,
  fieldCount: number,
  omittedOrOverridden: number,
): McpQualityGrade {
  const root = readSchemaNode(tool.inputSchema);
  let grade: McpQualityGrade = "excellent";
  if (root.required.length === 0) grade = worseOf(grade, "good");
  if (omittedOrOverridden > 0) grade = worseOf(grade, "good");
  if (fieldCount === 0) return "poor";
  if (omittedOrOverridden > fieldCount / 2) grade = worseOf(grade, "fair");
  return grade;
}

function gradeDescriptionQuality(tool: McpSnapshotTool): McpQualityGrade {
  const root = readSchemaNode(tool.inputSchema);
  const props = [...(root.properties ?? new Map()).values()];
  const described = props.filter((p) => {
    const n = readSchemaNode(p);
    return (n.description ?? "").trim().length >= 8;
  }).length;
  const toolDesc = tool.description.trim().length;
  if (toolDesc < 12) return props.length > 0 && described === props.length ? "fair" : "poor";
  if (props.length === 0 || described === props.length) return "excellent";
  if (described >= props.length / 2) return "good";
  return "fair";
}

function gradeComplexity(fieldCount: number, hasStructured: boolean): "low" | "medium" | "high" {
  if (fieldCount <= 4 && !hasStructured) return "low";
  if (fieldCount <= 10) return "medium";
  return "high";
}

const ID_FIELD_RE = /(^id$|Id$|_id$|^team|^project|^user|^assignee|^parent|^state|^label)/;

function gradePickerSupport(action: CompiledAction["meta"]): "none" | "partial" | "full" {
  const idFields = action.fields.filter((f) => ID_FIELD_RE.test(f.name));
  if (idFields.length === 0) return "none";
  const covered = idFields.filter(
    (f) => f.optionsSource !== undefined || (f.options !== undefined && f.options.length > 0),
  ).length;
  if (covered === idFields.length) return "full";
  return covered > 0 ? "partial" : "none";
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

interface CompiledOutputs {
  readonly outputs: OutputMeta[];
  readonly quality: McpQualityGrade;
}

function outputMetaFromSchema(
  name: string,
  raw: Record<string, unknown>,
  depth: number,
): OutputMeta | null {
  const node = readSchemaNode(raw);
  if (node.unsupported) return null;
  const desc = node.description ? { description: node.description } : {};
  if (node.enumValues || node.type === "string") return { name, type: "string", ...desc };
  if (node.type === "number" || node.type === "integer") return { name, type: "number", ...desc };
  if (node.type === "boolean") return { name, type: "boolean", ...desc };
  if (node.type === "array") return { name, type: "array", ...desc };
  if (node.type === "object") {
    if (depth >= 2 || !node.properties) return { name, type: "object", ...desc };
    const fields: OutputMeta[] = [];
    for (const [k, v] of node.properties) {
      const child = outputMetaFromSchema(k, v, depth + 1);
      if (child) fields.push(child);
    }
    return fields.length > 0 ? { name, type: "object", fields, ...desc } : { name, type: "object", ...desc };
  }
  return null;
}

/**
 * Output normalization (plan §4.3): a structured `outputSchema` compiles to a
 * typed OutputMeta tree (quality good/excellent); otherwise the catalog's
 * curated outputs (medium — human-declared, executor-enforced) or the bounded
 * text-only default (low). NEVER an unbounded blob — the CS-3 executor builds
 * the runtime output from exactly this declared key set.
 */
function compileOutputs(tool: McpSnapshotTool, entry: McpCatalogTool): CompiledOutputs {
  if (tool.outputSchema) {
    const root = readSchemaNode(tool.outputSchema);
    if (!root.unsupported && root.type === "object" && root.properties) {
      const outputs: OutputMeta[] = [];
      for (const [k, v] of root.properties) {
        const m = outputMetaFromSchema(k, v, 0);
        if (m) outputs.push(m);
      }
      if (outputs.length > 0) return { outputs, quality: "excellent" };
    }
    // Fall through: an unusable outputSchema is treated as absent.
  }
  if (entry.outputs && entry.outputs.length > 0) {
    return {
      outputs: entry.outputs.map((o) => ({
        name: o.name,
        type: o.type,
        ...(o.description ? { description: o.description } : {}),
      })),
      quality: "good",
    };
  }
  return {
    outputs: [
      {
        name: "text",
        type: "string",
        description: "Text returned by the provider for this call.",
      },
    ],
    quality: "poor",
  };
}

// ─── Per-tool compile ────────────────────────────────────────────────────────

export function compileAction(
  provider: string,
  tool: McpSnapshotTool,
  entry: McpCatalogTool,
): { action: CompiledAction } | { diagnostics: CompileDiagnostic[] } {
  const overrides = entry.fieldOverrides ?? {};
  const { fields, diagnostics } = compileFields(tool.name, tool.inputSchema, overrides);
  if (diagnostics.length > 0) return { diagnostics };

  const classification = entry.risk ?? classifyToolRisk(tool.name);
  const riskLevel = RISK_LEVEL_BY_CLASS[classification];
  const destructive = classification === "destructive";
  const { outputs, quality: outputQuality } = compileOutputs(tool, entry);

  const type = entry.type!;
  const meta: ActionMeta = ActionMetaSchema.parse({
    key: `${provider}:${type}`,
    provider,
    type,
    displayName: entry.displayName!,
    description: entry.description ?? tool.description,
    category: entry.category ?? "other",
    requiresIntegration: true,
    fields: fields.map((f) => f.meta),
    outputs,
    producesFileRef: false,
    consumesFileRef: false,
    ...(entry.displayOrder !== undefined ? { displayOrder: entry.displayOrder } : {}),
    isDestructive: destructive,
    requiresConfirmation: destructive,
    riskLevel,
    ...(entry.riskDescription ? { riskDescription: entry.riskDescription } : {}),
  });

  const overriddenCount = Object.keys(overrides).length;
  const schemaQuality = gradeSchemaQuality(tool, fields.length, overriddenCount);
  const descriptionQuality = gradeDescriptionQuality(tool);
  const hasStructured = fields.some((f) => f.kind.k === "object" || f.kind.k === "object-list");
  const complexity = gradeComplexity(fields.length, hasStructured);
  const pickerSupport = gradePickerSupport(meta);

  // Composites: planning leans on descriptions + outputs (what the React
  // Agent reasons over); configuration leans on schema + pickers (what an
  // ordinary user faces in the builder).
  const planningQuality = worseOf(descriptionQuality, outputQuality);
  const configurationQuality =
    pickerSupport === "none" && meta.fields.some((f) => ID_FIELD_RE.test(f.name) && f.required)
      ? worseOf(schemaQuality, "fair")
      : schemaQuality;

  const capability: McpCapabilityProfile = {
    key: meta.key,
    tool: tool.name,
    schemaQuality,
    outputQuality,
    descriptionQuality,
    complexity,
    pickerSupport,
    verified: entry.verified,
    risk: { classification, level: riskLevel },
    planningQuality,
    configurationQuality,
    schemaHash: tool.schemaHash,
  };

  return {
    action: { tool: tool.name, type, meta, fields, capability, schemaHash: tool.schemaHash, inputSchema: tool.inputSchema },
  };
}

// ─── Provider compile ────────────────────────────────────────────────────────

export function compileProvider(
  snapshotRaw: unknown,
  catalogRaw: unknown,
): CompiledProvider {
  const snapshot: McpToolSnapshotFile = McpToolSnapshotFileSchema.parse(snapshotRaw);
  const catalog: McpCatalog = McpCatalogSchema.parse(catalogRaw);
  if (snapshot.provider !== catalog.provider) {
    throw new Error(
      `snapshot provider '${snapshot.provider}' does not match catalog provider '${catalog.provider}'.`,
    );
  }

  const byName = new Map(snapshot.tools.map((t) => [t.name, t]));
  const actions: CompiledAction[] = [];
  const allDiagnostics: CompileDiagnostic[] = [];

  for (const entry of catalog.tools) {
    if (entry.decision !== "ship") continue;
    const tool = byName.get(entry.tool);
    if (!tool) {
      allDiagnostics.push({
        tool: entry.tool,
        path: "(snapshot)",
        reason: "approved tool is missing from the snapshot — re-capture or fix the catalog",
      });
      continue;
    }
    // Integrity: the pinned hash must match the snapshot's schema bytes.
    if (schemaHash(tool.inputSchema) !== tool.schemaHash) {
      allDiagnostics.push({
        tool: entry.tool,
        path: "(snapshot)",
        reason: "schemaHash does not match inputSchema — snapshot was hand-edited or corrupted",
      });
      continue;
    }
    const result = compileAction(catalog.provider, tool, entry);
    if ("diagnostics" in result) {
      allDiagnostics.push(...result.diagnostics);
    } else {
      actions.push(result.action);
    }
  }

  if (allDiagnostics.length > 0) {
    throw new McpCompileError(catalog.provider, allDiagnostics);
  }
  if (actions.length === 0) {
    throw new Error(`catalog for '${catalog.provider}' ships zero tools — nothing to generate.`);
  }

  return {
    provider: catalog.provider,
    serverUrl: catalog.serverUrl,
    actions,
    capabilityReport: McpCapabilityReportSchema.parse({
      provider: catalog.provider,
      actions: actions.map((a) => a.capability),
    }),
  };
}
