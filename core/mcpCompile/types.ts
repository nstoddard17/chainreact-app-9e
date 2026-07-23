import { z } from "zod";
import type { ActionMeta, FieldMeta, OutputMeta } from "@/contracts/actionMeta";

/**
 * MCP schema compiler — shared types (CS-2 MCP-COMPILER).
 *
 * The compiler turns an APPROVED subset of a vendor MCP server's `tools/list`
 * into ordinary V2 provider artifacts. Inputs are two committed files per
 * provider:
 *
 *   - `integrations/<p>/mcp-snapshot.json` — the captured tool catalog
 *     (validated by `McpToolSnapshotFileSchema`), refreshed by
 *     `scripts/mcp-import capture`.
 *   - `integrations/<p>/mcp-catalog.ts` — the human-approved allowlist +
 *     per-tool curation (validated by `McpCatalogSchema`). ONLY tools with
 *     `decision: "ship"` ever generate artifacts (CLAUDE.md: new tools never
 *     auto-appear).
 *
 * Pure data in → pure data + emitted TypeScript source out. No I/O here —
 * `scripts/mcp-import` owns reading/writing files.
 */

// ─── Snapshot (captured tools/list) ──────────────────────────────────────────

export const McpSnapshotToolSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().default(""),
    /** Raw JSON Schema object exactly as the server returned it. */
    inputSchema: z.record(z.string(), z.unknown()),
    /** Rare in the wild; when present the output compiler consumes it. */
    outputSchema: z.record(z.string(), z.unknown()).nullable().default(null),
    /** sha256 of the canonical JSON of `inputSchema` (drift pinning). */
    schemaHash: z.string().min(16),
  })
  .strict();
export type McpSnapshotTool = z.infer<typeof McpSnapshotToolSchema>;

export const McpToolSnapshotFileSchema = z
  .object({
    provider: z.string().min(1),
    serverUrl: z.string().min(1),
    protocolVersion: z.string().nullable().default(null),
    /**
     * Provenance: "live" = captured from the real server by
     * `scripts/mcp-import capture`; "docs-draft" = reconstructed from vendor
     * documentation pending live re-capture (recorded per the honesty rules —
     * a docs-draft snapshot MUST be re-captured before live certification).
     */
    capturedBy: z.enum(["live", "docs-draft"]),
    capturedAt: z.string().min(4),
    tools: z.array(McpSnapshotToolSchema).min(1),
  })
  .strict();
export type McpToolSnapshotFile = z.infer<typeof McpToolSnapshotFileSchema>;

// ─── Catalog (the approval allowlist) ────────────────────────────────────────

export const McpRiskClassificationSchema = z.enum([
  "read",
  "write",
  "financial",
  "administrative",
  "destructive",
  "unknown",
  "blocked",
]);
export type McpRiskClassification = z.infer<typeof McpRiskClassificationSchema>;

/** Per-field curation applied on top of the mechanical schema translation. */
export const McpCatalogFieldOverrideSchema = z
  .object({
    label: z.string().min(1).max(128).optional(),
    description: z.string().max(2048).optional(),
    /** Force the multiline editor for prose-y string fields. */
    multiline: z.boolean().optional(),
    /** Move a power-user knob to the Advanced tab (rule 4 sub-bullet). */
    advanced: z.boolean().optional(),
    sensitivity: z.enum(["secret", "connection", "recipient"]).optional(),
    placeholder: z.string().max(256).optional(),
    /**
     * Registered option-source id for a provider-resource picker (rule 17).
     * The referenced resolver must exist by the time the meta REGISTERS
     * (structure test); catalogs may only set this once the resolver ships.
     */
    optionsSource: z.string().min(1).max(128).optional(),
    dependsOn: z.array(z.string().min(1)).max(8).optional(),
    /**
     * Drop an OPTIONAL unsupported field from the generated surface instead
     * of failing compilation. Required fields can never be omitted.
     */
    omit: z.boolean().optional(),
    /**
     * Force requiredness beyond what the tool schema declares. Vendors that
     * consolidate create+update into one dispatcher tool (Linear's
     * `save_issue`) leave create-time requirements in prose; splitting that
     * tool into typed V2 actions (plan §10.5) pins them here — e.g.
     * `create_issue` requires `title`+`team`, `update_issue` requires `id`.
     */
    required: z.boolean().optional(),
    /**
     * Curated CLOSED vocabulary for a field the tool schema types as a bare
     * scalar (number/string) with the allowed set stated only in prose — e.g.
     * Linear `priority` is `type: number` described "0=None…4=Low". Renders a
     * `select` (a labelled dropdown) and CONSTRAINS the generated zod schema to
     * exactly these values, so an ordinary user picks a named level instead of
     * typing a magic number and out-of-range / negative / non-member values are
     * rejected at parse time (rule 17 + Q11). All values must share ONE type
     * (all number or all string) and match the field's underlying scalar type;
     * numeric values must be a contiguous integer range (the picker commits a
     * string, which the schema coerces back to the bounded wire number). Use
     * ONLY the vendor's documented set — never invent values.
     */
    enumValues: z
      .array(
        z
          .object({
            value: z.union([z.number(), z.string().min(1).max(256)]),
            label: z.string().min(1).max(128),
          })
          .strict(),
      )
      .min(1)
      .max(64)
      .optional(),
    /**
     * Inject a numeric lower/upper bound the tool schema omits so a numeric
     * field carries valid bounds (rule 17 numeric-audit). Merged over any
     * `minimum`/`maximum` already in the tool schema.
     */
    numericMin: z.number().finite().optional(),
    numericMax: z.number().finite().optional(),
  })
  .strict();
export type McpCatalogFieldOverride = z.infer<typeof McpCatalogFieldOverrideSchema>;

/**
 * Per-tool evidence-capture approval (CS-5A). The ONLY way a tool becomes
 * auto-callable by `capture --evidence`: an operator commits bounded, safe
 * sample arguments here. Double-gated at capture time — the tool must ALSO be
 * read-only (effective risk `read`); write/destructive/financial/admin/unknown
 * tools are never auto-invoked even with an evidence block. Compiler ignores
 * this field entirely (generated artifacts are unaffected).
 */
export const McpEvidenceApprovalSchema = z
  .object({
    /** Bounded, committed-safe arguments for the read-only evidence call. */
    sampleArgs: z.record(z.string(), z.unknown()),
  })
  .strict();
export type McpEvidenceApproval = z.infer<typeof McpEvidenceApprovalSchema>;

/**
 * Per-tool WRITE-evidence approval (CS-6B). Marks a WRITE tool as eligible for
 * the explicit, operator-gated `write-evidence` command (never the ordinary
 * `capture --evidence`). Approval alone is not enough: the command ALSO requires
 * `--allow-write-evidence`, an operator-supplied `--fixture` of disposable test
 * args, a second `--yes-run-write` acknowledgment, and effective risk exactly
 * `write` (destructive/financial/administrative/delete/refund/publish/invite are
 * always refused). `description` is shown in the confirmation prompt. No args
 * are committed here — the operator provides disposable values via the fixture.
 */
export const McpWriteEvidenceApprovalSchema = z
  .object({
    /** Human description of what the write does — shown in the confirmation. */
    description: z.string().min(1).max(512),
  })
  .strict();
export type McpWriteEvidenceApproval = z.infer<typeof McpWriteEvidenceApprovalSchema>;

/** Curated output shape used when the tool declares no usable outputSchema. */
export const McpCuratedOutputSchema = z
  .object({
    name: z.string().min(1).max(128),
    type: z.enum(["string", "number", "boolean", "object", "array"]),
    description: z.string().max(1024).optional(),
  })
  .strict();
export type McpCuratedOutput = z.infer<typeof McpCuratedOutputSchema>;

export const McpCatalogToolSchema = z
  .object({
    /** Tool name exactly as it appears in the snapshot. */
    tool: z.string().min(1),
    decision: z.enum(["ship", "skip", "defer"]),
    /** Required for skip/defer too — the catalog IS the decision record. */
    reason: z.string().min(1).max(2048),
    /** V2 action `type` (snake_case) — required when shipping. */
    type: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .optional(),
    displayName: z.string().min(1).max(128).optional(),
    /** Overrides the tool's own description in the generated meta. */
    description: z.string().max(2048).optional(),
    category: z
      .enum([
        "messaging",
        "email",
        "calendar",
        "files",
        "data",
        "commerce",
        "crm",
        "marketing",
        "developer",
        "logic",
        "http",
        "transform",
        "scheduling",
        "other",
      ])
      .optional(),
    displayOrder: z.number().int().min(0).optional(),
    /** Human override of the automatic risk classification (human wins). */
    risk: McpRiskClassificationSchema.optional(),
    riskDescription: z.string().max(1024).optional(),
    fieldOverrides: z.record(z.string(), McpCatalogFieldOverrideSchema).optional(),
    /** Curated bounded outputs (used when no structured outputSchema). */
    outputs: z.array(McpCuratedOutputSchema).max(64).optional(),
    /**
     * CS-5A — operator approval for `capture --evidence` to auto-invoke this
     * (read-only) tool with committed sample args. Absent ⇒ never auto-called.
     */
    evidence: McpEvidenceApprovalSchema.optional(),
    /**
     * CS-6B — approval for the explicit, operator-gated `write-evidence` command
     * (WRITE tools only; disposable-record fixture supplied at run time). Absent
     * ⇒ the tool can never be write-evidence-captured.
     */
    writeEvidence: McpWriteEvidenceApprovalSchema.optional(),
    /** Flipped by live certification (Phase-13 analog) — never by codegen. */
    verified: z.boolean().default(false),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.decision === "ship") {
      if (!entry.type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `catalog entry for '${entry.tool}': decision "ship" requires a V2 action 'type'.`,
        });
      }
      if (!entry.displayName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `catalog entry for '${entry.tool}': decision "ship" requires 'displayName'.`,
        });
      }
      if (entry.risk === "blocked") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `catalog entry for '${entry.tool}': risk "blocked" cannot ship.`,
        });
      }
    }
  });
export type McpCatalogTool = z.infer<typeof McpCatalogToolSchema>;

export const McpCatalogSchema = z
  .object({
    provider: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    /** Canonical MCP server URL the executor will call (CS-3). */
    serverUrl: z.string().min(1),
    tools: z.array(McpCatalogToolSchema).min(1),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    // One tool MAY ship as several typed V2 actions (plan §10.5 — splitting a
    // vendor create-or-update dispatcher). Uniqueness is therefore on the V2
    // action `type` (and on non-ship decisions per tool, which are records).
    const seenNonShip = new Set<string>();
    const seenTypes = new Set<string>();
    for (const t of catalog.tools) {
      if (t.decision !== "ship") {
        if (seenNonShip.has(t.tool)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate ${t.decision} entry for tool '${t.tool}'.`,
          });
        }
        seenNonShip.add(t.tool);
      }
      if (t.decision === "ship" && t.type) {
        if (seenTypes.has(t.type)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate shipped action type '${t.type}'.`,
          });
        }
        seenTypes.add(t.type);
      }
    }
  });
export type McpCatalog = z.infer<typeof McpCatalogSchema>;

// ─── Capability quality profile ──────────────────────────────────────────────

export const McpQualityGradeSchema = z.enum(["excellent", "good", "fair", "poor"]);
export type McpQualityGrade = z.infer<typeof McpQualityGradeSchema>;

/**
 * Compiler-derived quality/capability metadata per shipped action. Persisted
 * to `integrations/<p>/mcp-capabilities.json`. The React Agent's future
 * implementation-selection logic (plan §4.9 / CS-5+) CONSUMES this; nothing
 * reads it at runtime yet — deliberately kept out of `ActionMeta` so the
 * shared builder contract is untouched (CS-2 scope).
 */
export const McpCapabilityProfileSchema = z
  .object({
    /** `${provider}:${type}` — matches the generated ActionMeta key. */
    key: z.string().min(3),
    tool: z.string().min(1),
    schemaQuality: McpQualityGradeSchema,
    outputQuality: McpQualityGradeSchema,
    descriptionQuality: McpQualityGradeSchema,
    complexity: z.enum(["low", "medium", "high"]),
    /** none: no id-like fields; partial/full: picker coverage of id fields. */
    pickerSupport: z.enum(["none", "partial", "full"]),
    verified: z.boolean(),
    risk: z
      .object({
        classification: McpRiskClassificationSchema,
        level: z.enum(["low", "medium", "high"]),
      })
      .strict(),
    planningQuality: McpQualityGradeSchema,
    configurationQuality: McpQualityGradeSchema,
    /** Pin the exact input schema this profile graded. */
    schemaHash: z.string().min(16),
  })
  .strict();
export type McpCapabilityProfile = z.infer<typeof McpCapabilityProfileSchema>;

export const McpCapabilityReportSchema = z
  .object({
    provider: z.string().min(1),
    actions: z.array(McpCapabilityProfileSchema),
  })
  .strict();
export type McpCapabilityReport = z.infer<typeof McpCapabilityReportSchema>;

// ─── Compiler results ────────────────────────────────────────────────────────

/** One unsupported-schema finding. NEVER silently absorbed. */
export interface CompileDiagnostic {
  readonly tool: string;
  /** JSON-pointer-ish path into the input schema, e.g. "properties.links". */
  readonly path: string;
  readonly reason: string;
}

export interface CompiledAction {
  readonly tool: string;
  readonly type: string;
  /** Validated, ready-to-serialize builder metadata. */
  readonly meta: ActionMeta;
  /** IR the zod-schema emitter consumes (mirrors meta.fields 1:1). */
  readonly fields: readonly CompiledFieldIr[];
  readonly capability: McpCapabilityProfile;
  readonly schemaHash: string;
  /**
   * The certified tool inputSchema (raw, from the snapshot). Emitted into the
   * generated `_pinned.ts` so the runtime executor can CLASSIFY drift (breaking
   * vs safe-addition) — not just compare hashes (CS-4). Several actions may
   * share one tool's schema (e.g. Linear's save_issue → create/update); the
   * emitter dedupes by tool.
   */
  readonly inputSchema: Record<string, unknown>;
}

export interface CompiledProvider {
  readonly provider: string;
  readonly serverUrl: string;
  readonly actions: readonly CompiledAction[];
  readonly capabilityReport: McpCapabilityReport;
}

/**
 * Intermediate field representation — everything both emitters (FieldMeta
 * data + zod source) need, so the two can never drift from each other.
 */
export interface CompiledFieldIr {
  readonly name: string;
  readonly required: boolean;
  readonly nullable: boolean;
  readonly kind: CompiledFieldKind;
  readonly meta: FieldMeta;
}

export type CompiledFieldKind =
  | { readonly k: "string"; readonly multiline: boolean }
  | { readonly k: "enum"; readonly values: readonly string[] }
  | { readonly k: "enum-array"; readonly values: readonly string[] }
  | {
      readonly k: "curated-enum";
      readonly valueType: "number" | "string";
      readonly options: readonly { readonly value: number | string; readonly label: string }[];
    }
  | { readonly k: "number"; readonly integer: boolean; readonly min?: number; readonly max?: number }
  | { readonly k: "boolean" }
  | { readonly k: "date" }
  | { readonly k: "datetime" }
  | { readonly k: "string-array"; readonly maxItems?: number }
  | {
      readonly k: "object";
      readonly members: readonly CompiledObjectMemberIr[];
    }
  | {
      readonly k: "object-list";
      readonly members: readonly CompiledObjectMemberIr[];
      readonly maxItems?: number;
    };

export interface CompiledObjectMemberIr {
  readonly name: string;
  readonly required: boolean;
  readonly kind:
    | { readonly k: "string" }
    | { readonly k: "enum"; readonly values: readonly string[] }
    | { readonly k: "number"; readonly integer: boolean }
    | { readonly k: "boolean" };
}

/** Thrown by compileProvider when any shipped tool has unsupported schema. */
export class McpCompileError extends Error {
  readonly diagnostics: readonly CompileDiagnostic[];
  constructor(provider: string, diagnostics: readonly CompileDiagnostic[]) {
    super(
      `MCP compile failed for '${provider}' — unsupported schema constructs (curate or omit in mcp-catalog.ts, never silently fall back):\n` +
        diagnostics.map((d) => `  - ${d.tool} @ ${d.path}: ${d.reason}`).join("\n"),
    );
    this.name = "McpCompileError";
    this.diagnostics = diagnostics;
  }
}

/** Re-export the meta types emitters consume, for convenience. */
export type { ActionMeta, FieldMeta, OutputMeta };
