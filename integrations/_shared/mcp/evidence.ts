/**
 * Certification evidence capture (CS-5A).
 *
 * `capture --evidence` runs a SMALL, explicitly-approved set of READ-ONLY tool
 * calls and records the SHAPE of their results, so a human can curate bounded
 * structured outputs + resolver candidates instead of guessing. It never blindly
 * invokes every tool, and it never authors catalog/meta changes — evidence is
 * INPUT to a human review, not an authority.
 *
 * Safety by construction:
 *   - Double gate: a tool is auto-called only if it is read-only (effective risk
 *     `read`) AND the catalog commits an `evidence.sampleArgs` approval. Write /
 *     destructive / financial / admin / unknown tools are never auto-invoked.
 *   - TYPE-ONLY shapes: results are reduced to a type skeleton ("string",
 *     "number", …). Real business values are NOT retained, so no PII/secret can
 *     ride into the committed artifact. As a belt-and-suspenders, the serialized
 *     shape is scrubbed; if scrubbing changes anything, the evidence is marked
 *     unsafe and its shape is withheld (manual review required).
 *   - Bounded: arrays sampled to one element, object keys/depth capped.
 * The CALLER (CLI) bounds the transport (existing `maxResponseBytes` + timeout on
 * the shared client) and supplies the bearer; this module is pure given a
 * `callTool` seam, so it is fully unit-testable without a live server.
 */

import { scrubSecrets } from "./sanitize";
import type { McpCallToolResult } from "./types";
import { classifyToolRisk, type McpCatalog, type McpToolSnapshotFile } from "@/core/mcpCompile";

const MAX_DEPTH = 5;
const MAX_OBJECT_KEYS = 50;
const CURSOR_KEYS = new Set(["nextcursor", "next_cursor", "cursor", "hasmore", "has_more"]);
const ID_KEYS = ["id", "identifier", "key", "gid", "uuid"];
const NAME_KEYS = ["name", "title", "label", "displayname", "display_name"];

export type EvidenceRecommendation =
  | "structured_output_curatable"
  | "text_only_appropriate"
  | "evidence_insufficient";

export interface EvidenceShape {
  readonly resultKind: "structured" | "text" | "empty";
  /** Type-only skeleton (structured only). */
  readonly observedShape?: unknown;
  readonly fieldsObserved?: readonly string[];
  readonly pagination?: { readonly cursorField: string } | null;
  /** Character length only (text only) — never the raw text. */
  readonly textLength?: number;
  readonly supportsStructuredOutput: boolean;
  readonly recommendation: EvidenceRecommendation;
  readonly notes: readonly string[];
  /** false ⇒ scrubbing could not confidently sanitize; do NOT commit the shape. */
  readonly safe: boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Reduce any value to a TYPE-ONLY skeleton. Bounded depth / array sample / keys. */
export function typeSkeleton(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (depth >= MAX_DEPTH) return "...";
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [typeSkeleton(value[0], depth + 1)];
  }
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object": {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      let n = 0;
      for (const k of Object.keys(obj)) {
        if (n++ >= MAX_OBJECT_KEYS) {
          out["…"] = "truncated";
          break;
        }
        out[k] = typeSkeleton(obj[k], depth + 1);
      }
      return out;
    }
    default:
      return "unknown";
  }
}

/** The structured payload as object/array, else null (text-only result). */
function structuredPayload(result: McpCallToolResult): unknown {
  if (isPlainObject(result.structuredContent) || Array.isArray(result.structuredContent)) {
    return result.structuredContent;
  }
  const firstText = (result.content ?? []).find((b) => b.type === "text" && typeof b.text === "string")?.text;
  if (typeof firstText === "string") {
    try {
      const parsed = JSON.parse(firstText) as unknown;
      if (isPlainObject(parsed) || Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON
    }
  }
  return null;
}

function firstObject(payload: unknown): Record<string, unknown> | null {
  if (isPlainObject(payload)) return payload;
  if (Array.isArray(payload) && isPlainObject(payload[0])) return payload[0] as Record<string, unknown>;
  return null;
}

/** Detect a top-level pagination cursor field, if any. */
function detectPagination(payload: unknown): { cursorField: string } | null {
  const obj = isPlainObject(payload) ? payload : null;
  if (!obj) return null;
  for (const k of Object.keys(obj)) {
    if (CURSOR_KEYS.has(k.toLowerCase())) return { cursorField: k };
  }
  return null;
}

/** A tool whose result is a list of {id-like, name-like} rows is a resolver candidate. */
function isResolverCandidate(payload: unknown): boolean {
  const arrays: unknown[][] = [];
  if (Array.isArray(payload)) arrays.push(payload);
  if (isPlainObject(payload)) {
    for (const v of Object.values(payload)) if (Array.isArray(v)) arrays.push(v);
  }
  for (const arr of arrays) {
    const row = arr.find(isPlainObject) as Record<string, unknown> | undefined;
    if (!row) continue;
    const keys = Object.keys(row).map((k) => k.toLowerCase());
    const hasId = ID_KEYS.some((k) => keys.includes(k));
    const hasName = NAME_KEYS.some((k) => keys.includes(k));
    if (hasId && hasName) return true;
  }
  return false;
}

/** Derive committable, type-only evidence from one tool result. Pure. */
export function deriveEvidenceShape(result: McpCallToolResult): EvidenceShape {
  const payload = structuredPayload(result);

  if (payload === null) {
    const text = (result.content ?? []).find((b) => b.type === "text" && typeof b.text === "string")?.text;
    if (typeof text === "string" && text.length > 0) {
      return {
        resultKind: "text",
        textLength: text.length,
        supportsStructuredOutput: false,
        recommendation: "text_only_appropriate",
        notes: [],
        safe: true, // no raw text retained
      };
    }
    return {
      resultKind: "empty",
      supportsStructuredOutput: false,
      recommendation: "evidence_insufficient",
      notes: [],
      safe: true,
    };
  }

  const observedShape = typeSkeleton(payload);
  const row = firstObject(payload);
  const fieldsObserved = row ? Object.keys(row).slice(0, MAX_OBJECT_KEYS) : isPlainObject(payload) ? Object.keys(payload) : [];
  const pagination = detectPagination(payload);
  const notes: string[] = [];
  if (pagination) notes.push("pagination_detected");
  if (isResolverCandidate(payload)) notes.push("resolver_candidate");

  const supportsStructuredOutput = fieldsObserved.length > 0;

  // Belt-and-suspenders: type-only shapes carry no values, but scrub the
  // serialized skeleton (incl. field names) and refuse to commit if anything
  // looks like a secret slipped through.
  const serialized = JSON.stringify({ observedShape, fieldsObserved });
  const safe = scrubSecrets(serialized) === serialized;

  return {
    resultKind: "structured",
    observedShape,
    fieldsObserved,
    pagination,
    supportsStructuredOutput,
    recommendation: supportsStructuredOutput ? "structured_output_curatable" : "evidence_insufficient",
    notes,
    safe,
  };
}

// ─── Tool selection (the double gate) ────────────────────────────────────────

export interface EvidenceCallable {
  readonly tool: string;
  readonly schemaHash: string;
  readonly sampleArgs: Record<string, unknown>;
}
export interface EvidenceSkip {
  readonly tool: string;
  readonly reason: string;
}

/**
 * Decide which shipped tools may be auto-called for evidence. A tool qualifies
 * ONLY if it is read-only AND the catalog commits an `evidence` approval;
 * everything else is skipped WITH A REASON (so the human sees the gap).
 */
export function selectEvidenceTools(
  catalog: McpCatalog,
  snapshot: McpToolSnapshotFile,
): { callable: EvidenceCallable[]; skipped: EvidenceSkip[] } {
  const hashByTool = new Map(snapshot.tools.map((t) => [t.name, t.schemaHash]));
  const callable: EvidenceCallable[] = [];
  const skipped: EvidenceSkip[] = [];

  for (const entry of catalog.tools) {
    const sampleArgs = entry.evidence?.sampleArgs;
    const hasEvidence = !!sampleArgs;
    // Surface SHIP tools (so missing coverage is visible) and any tool that
    // carries an explicit evidence approval (e.g. a `defer`'d resolver-source
    // list tool — captured for resolver design, not shipped as an action).
    // Other non-ship tools are ignored to avoid clutter.
    if (entry.decision !== "ship" && !hasEvidence) continue;
    const effectiveRisk = entry.risk ?? classifyToolRisk(entry.tool);
    if (effectiveRisk !== "read") {
      skipped.push({ tool: entry.tool, reason: `not read-only (risk: ${effectiveRisk}) — write-tool evidence execution is deferred (CS-5A)` });
      continue;
    }
    if (!hasEvidence) {
      skipped.push({ tool: entry.tool, reason: "no evidence approval — add an `evidence.sampleArgs` block to the catalog to allow capture" });
      continue;
    }
    const schemaHash = hashByTool.get(entry.tool);
    if (!schemaHash) {
      skipped.push({ tool: entry.tool, reason: "tool missing from the snapshot — re-capture first" });
      continue;
    }
    callable.push({ tool: entry.tool, schemaHash, sampleArgs });
  }
  return { callable, skipped };
}

// ─── Evidence artifact ───────────────────────────────────────────────────────

export interface ToolEvidence {
  readonly tool: string;
  readonly schemaHash?: string;
  readonly captureStatus: "captured" | "skipped" | "manual_review_required" | "error";
  readonly reason?: string;
  readonly resultKind?: EvidenceShape["resultKind"];
  readonly observedShape?: unknown;
  readonly fieldsObserved?: readonly string[];
  readonly pagination?: { readonly cursorField: string } | null;
  readonly textLength?: number;
  readonly supportsStructuredOutput?: boolean;
  readonly recommendation?: EvidenceRecommendation;
  readonly notes?: readonly string[];
}

export interface EvidenceArtifact {
  readonly provider: string;
  readonly tools: readonly ToolEvidence[];
}

/** Injected tool-call seam — CLI passes the live client; tests pass a fake. */
export type EvidenceCallTool = (tool: string, args: Record<string, unknown>) => Promise<McpCallToolResult>;

/** Safe, scrubbed, bounded error message (never a raw provider body). */
function safeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "unknown error";
  return scrubSecrets(raw).slice(0, 200);
}

/**
 * Run the approved read-only calls and build a deterministic, committable
 * evidence artifact. Pure given `callTool`. Tools are sorted by name so the
 * artifact is stable across runs.
 */
export async function buildEvidence(input: {
  provider: string;
  catalog: McpCatalog;
  snapshot: McpToolSnapshotFile;
  callTool: EvidenceCallTool;
}): Promise<EvidenceArtifact> {
  const { callable, skipped } = selectEvidenceTools(input.catalog, input.snapshot);
  const tools: ToolEvidence[] = [];

  for (const c of callable) {
    try {
      const result = await input.callTool(c.tool, c.sampleArgs);
      const shape = deriveEvidenceShape(result);
      if (!shape.safe) {
        tools.push({
          tool: c.tool,
          schemaHash: c.schemaHash,
          captureStatus: "manual_review_required",
          reason: "sanitization could not confidently make the result safe to commit",
        });
        continue;
      }
      tools.push({
        tool: c.tool,
        schemaHash: c.schemaHash,
        captureStatus: "captured",
        resultKind: shape.resultKind,
        ...(shape.observedShape !== undefined ? { observedShape: shape.observedShape } : {}),
        ...(shape.fieldsObserved ? { fieldsObserved: shape.fieldsObserved } : {}),
        ...(shape.pagination !== undefined ? { pagination: shape.pagination } : {}),
        ...(shape.textLength !== undefined ? { textLength: shape.textLength } : {}),
        supportsStructuredOutput: shape.supportsStructuredOutput,
        recommendation: shape.recommendation,
        notes: shape.notes,
      });
    } catch (err) {
      tools.push({ tool: c.tool, schemaHash: c.schemaHash, captureStatus: "error", reason: safeError(err) });
    }
  }

  for (const s of skipped) {
    tools.push({ tool: s.tool, captureStatus: "skipped", reason: s.reason });
  }

  tools.sort((a, b) => a.tool.localeCompare(b.tool));
  return { provider: input.provider, tools };
}
