/**
 * MCP drift classification + internal review report (CS-4 MCP-DRIFT).
 *
 * CS-3 shipped a binary runtime guard: live schema == pinned hash → run, else
 * refuse. CS-4 turns that single bit into a first-class, human-graded concept.
 * This PURE module (no I/O) compares a certified snapshot against a live
 * `tools/list` and classifies every certified tool, then maps each result to a
 * provider-agnostic `CertificationState` that BOTH the runtime execution gate
 * and the internal review report read — so "what does this change mean" has one
 * definition.
 *
 * It NEVER regenerates providers, approves tools, or publishes catalog updates
 * (CLAUDE.md / plan §4.8 — those are human decisions). It only detects and
 * describes.
 *
 * Input-axis classification governs execution (can our certified args still be
 * valid?). Output drift is surfaced as a separate informational flag — a changed
 * output shape never makes an INPUT unsafe, and the runtime output normalizer
 * already fails honestly on a shape mismatch.
 */

import { schemaHash, canonicalJson, type McpSnapshotTool, type McpCatalog } from "@/core/mcpCompile";
import { detectSchemaDrift } from "./drift";
import type { McpTool } from "./types";
import {
  certificationStateInfo,
  isExecutionAllowed,
  type CertificationState,
  type CertificationStateInfo,
} from "@/core/certification/certificationState";

export type DriftClassification =
  | "no_change"
  | "safe_addition"
  | "breaking_change"
  | "tool_removed"
  | "tool_renamed"
  | "schema_changed"
  | "output_changed";

/** Structured top-level field diff (names only — never values). */
export interface SchemaFieldDiff {
  readonly removed: readonly string[];
  readonly added: readonly string[];
  readonly newlyRequired: readonly string[];
  readonly modified: readonly string[];
}

function topProps(schema: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const props = schema.properties;
  if (props && typeof props === "object") {
    for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
      if (v && typeof v === "object") out.set(k, v as Record<string, unknown>);
    }
  }
  return out;
}

function requiredSet(schema: Record<string, unknown>): Set<string> {
  const req = schema.required;
  return new Set(Array.isArray(req) ? req.filter((r): r is string => typeof r === "string") : []);
}

/** Names-only diff of two input schemas' top-level shape. */
export function diffSchemaFields(
  certified: Record<string, unknown>,
  live: Record<string, unknown>,
): SchemaFieldDiff {
  const cProps = topProps(certified);
  const lProps = topProps(live);
  const cReq = requiredSet(certified);
  const lReq = requiredSet(live);

  const removed = [...cProps.keys()].filter((k) => !lProps.has(k)).sort();
  const added = [...lProps.keys()].filter((k) => !cProps.has(k)).sort();
  const newlyRequired = [...lReq].filter((k) => !cReq.has(k)).sort();
  // A shared property whose sub-schema changed (type/constraint/enum/etc.).
  const modified = [...cProps.keys()]
    .filter((k) => lProps.has(k) && canonicalJson(cProps.get(k)) !== canonicalJson(lProps.get(k)))
    .sort();

  return { removed, added, newlyRequired, modified };
}

/**
 * Classify one certified tool against the live catalog (INPUT axis).
 * `live === undefined` ⇒ the tool is gone. Rename detection needs the whole
 * live list and is resolved by `buildDriftReport`, so a lone tool reports
 * `tool_removed` here.
 */
/** Minimal certified shape the input-axis classifier needs (executor passes this). */
export type CertifiedToolPin = Pick<McpSnapshotTool, "inputSchema" | "schemaHash">;

export function classifyToolDrift(
  certified: CertifiedToolPin,
  live: McpTool | undefined,
): DriftClassification {
  if (!live) return "tool_removed";

  const liveSchema = (live.inputSchema ?? {}) as Record<string, unknown>;
  if (schemaHash(liveSchema) === certified.schemaHash) return "no_change";

  // Removed field OR newly-required field ⇒ our certified args may be invalid.
  if (detectSchemaDrift(certified.inputSchema, liveSchema).drifted) return "breaking_change";

  const diff = diffSchemaFields(certified.inputSchema, liveSchema);
  // Purely-additive optional fields with every existing field byte-identical:
  // our certified args stay valid, so this is safe (flagged for review).
  if (diff.added.length > 0 && diff.modified.length === 0 && diff.removed.length === 0) {
    return "safe_addition";
  }
  // Any other change we can't prove safe (modified field, tightened constraint,
  // top-level shape change) ⇒ fail closed. "Never execute against unknown schemas."
  return "schema_changed";
}

/** Drift classification → certification state (single mapping, reused everywhere). */
export function driftToCertificationState(c: DriftClassification): CertificationState {
  switch (c) {
    case "no_change":
      return "healthy";
    case "safe_addition":
    case "output_changed":
      return "needs_review";
    case "breaking_change":
    case "tool_removed":
    case "tool_renamed":
    case "schema_changed":
      return "blocked";
  }
}

/** Does this classification permit execution (via the shared cert-state gate)? */
export function driftAllowsExecution(c: DriftClassification): boolean {
  return isExecutionAllowed(driftToCertificationState(c));
}

// ─── Internal review report ──────────────────────────────────────────────────

export interface ToolDriftFinding {
  readonly tool: string;
  readonly classification: DriftClassification;
  readonly certificationState: CertificationState;
  readonly executionAllowed: boolean;
  /** Names-only field diff (empty for no_change / tool_removed). */
  readonly fields: SchemaFieldDiff;
  /** V2 action keys compiled from this tool (may be several per tool). */
  readonly affectedActions: readonly string[];
  /** For tool_renamed: the live tool name that carries the certified schema. */
  readonly renamedTo?: string;
  readonly reason: string;
}

export interface DriftReport {
  readonly provider: string;
  readonly serverUrl: string;
  /** Live tools the certified snapshot never approved (informational only). */
  readonly unapprovedNewTools: readonly string[];
  readonly findings: readonly ToolDriftFinding[];
  /** Highest-severity signal across all findings. */
  readonly overallRisk: "none" | "review" | "breaking";
  /** True when at least one tool needs a human re-certification decision. */
  readonly readyForCertification: boolean;
  /**
   * Workflows referencing an affected action. `null` ⇒ NOT computed by this
   * report (requires a workflow scan the pure classifier deliberately omits;
   * the drift sweep is ops-only and never touches user data — plan §4.8).
   */
  readonly affectedWorkflows: number | null;
}

const REASONS: Record<DriftClassification, string> = {
  no_change: "Matches the certified version.",
  safe_addition: "New optional field(s) added; certified inputs remain valid.",
  breaking_change: "A field was removed or newly required; certified inputs may be invalid.",
  tool_removed: "The tool is no longer offered by the server.",
  tool_renamed: "The tool appears to have been renamed (same schema, new name).",
  schema_changed: "An existing field changed in a way that can't be proven safe.",
  output_changed: "The result shape changed.",
};

/** Map a certified tool → the V2 action keys the catalog compiled from it. */
function actionsForTool(catalog: McpCatalog | undefined, tool: string): string[] {
  if (!catalog) return [];
  return catalog.tools
    .filter((t) => t.decision === "ship" && t.tool === tool && t.type)
    .map((t) => `${catalog.provider}:${t.type}`);
}

/**
 * Build the internal review report from a certified snapshot + a live
 * `tools/list`. Pure — the CLI renders it; a future cron alerts on it.
 */
export function buildDriftReport(input: {
  provider: string;
  serverUrl: string;
  certifiedTools: readonly McpSnapshotTool[];
  liveTools: readonly McpTool[];
  catalog?: McpCatalog;
}): DriftReport {
  const liveByName = new Map(input.liveTools.map((t) => [t.name, t]));
  const certifiedNames = new Set(input.certifiedTools.map((t) => t.name));
  const certifiedHashes = new Map(input.certifiedTools.map((t) => [t.schemaHash, t.name]));

  const findings: ToolDriftFinding[] = [];
  for (const certified of input.certifiedTools) {
    const live = liveByName.get(certified.name);
    let classification = classifyToolDrift(certified, live);
    let renamedTo: string | undefined;

    // Rename detection: a removed tool whose exact certified schema now appears
    // under a different, not-otherwise-certified live tool name.
    if (classification === "tool_removed") {
      const match = input.liveTools.find(
        (t) => !certifiedNames.has(t.name) && schemaHash((t.inputSchema ?? {}) as Record<string, unknown>) === certified.schemaHash,
      );
      if (match) {
        classification = "tool_renamed";
        renamedTo = match.name;
      }
    }

    const certificationState = driftToCertificationState(classification);
    findings.push({
      tool: certified.name,
      classification,
      certificationState,
      executionAllowed: isExecutionAllowed(certificationState),
      fields: live ? diffSchemaFields(certified.inputSchema, (live.inputSchema ?? {}) as Record<string, unknown>) : { removed: [], added: [], newlyRequired: [], modified: [] },
      affectedActions: actionsForTool(input.catalog, certified.name),
      ...(renamedTo ? { renamedTo } : {}),
      reason: REASONS[classification],
    });
  }

  // Live tools the catalog never certified (new server tools never auto-appear).
  const unapprovedNewTools = input.liveTools
    .map((t) => t.name)
    .filter((n) => !certifiedNames.has(n) && !certifiedHashes.has(schemaHash((liveByName.get(n)!.inputSchema ?? {}) as Record<string, unknown>)))
    .sort();

  const anyBreaking = findings.some((f) => !f.executionAllowed);
  const anyReview = findings.some((f) => f.certificationState === "needs_review");
  const overallRisk: DriftReport["overallRisk"] = anyBreaking ? "breaking" : anyReview ? "review" : "none";
  const readyForCertification = findings.some((f) => f.classification !== "no_change");

  return {
    provider: input.provider,
    serverUrl: input.serverUrl,
    unapprovedNewTools,
    findings,
    overallRisk,
    readyForCertification,
    affectedWorkflows: null,
  };
}

/** Re-export for report renderers that want the state metadata. */
export function findingStateInfo(f: ToolDriftFinding): CertificationStateInfo {
  return certificationStateInfo(f.certificationState);
}
