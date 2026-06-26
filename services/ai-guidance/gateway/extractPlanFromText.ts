/**
 * Deterministic WorkflowPlan extractor from Hermes Agent guidance TEXT (HERMES-AGENT-PLAN-EXTRACTION).
 *
 * The gateway returns advisory guidance as free text in the OpenAI-style envelope's
 * `choices[0].message.content`. The Hermes Agent is prompted to OPTIONALLY include a structured plan
 * as a fenced ```json block when it has enough detail. This module pulls that block out and parses it
 * into a SHAPE-valid `WorkflowPlan` candidate — nothing more.
 *
 * Hard properties (all enforced here):
 *   - DETERMINISTIC + MODEL-FREE: pure string parsing + Zod. No network, no model, no state.
 *   - SHAPE ONLY: this returns a candidate whose JSON conforms to the WorkflowPlan shape. It does
 *     NOT capability-validate provider/type — that is `validateWorkflowPlan`'s job, run by the
 *     normalizer. A shape-valid-but-hallucinated plan is still returned here so the caller can reject
 *     it with a safe warning (never accept arbitrary JSON as a real plan).
 *   - PROSE-TOLERANT: ordinary guidance with no JSON returns `null` (no plan, no error).
 *   - SAFE WITH MULTIPLE BLOCKS: scans fenced blocks in order, returns the FIRST that is a shape-valid
 *     plan; non-plan JSON blocks (examples, configs) are skipped, not mis-parsed.
 *   - NEVER THROWS: malformed JSON / non-JSON fences are ignored.
 *
 * Nothing here creates, mutates, applies, runs, or persists a workflow.
 */

import { z } from "zod";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import { WORKFLOW_PLAN_SCHEMA_VERSION } from "@/contracts/guidanceSession";
import type { PatchOperation } from "@/services/workflows/patch/types";
import { PatchOperationSchema } from "@/services/workflows/patch/workflowPatchSchema";

/**
 * Shape schema for an embedded plan. `provider`/`type` are CLAIMS (any string) — capability validity
 * is decided later by `validateWorkflowPlan` against the real registry. `.passthrough()` tolerates
 * extra keys the model may add; we only copy known fields out.
 */
const planStepShapeSchema = z
  .object({
    ref: z.string().min(1).optional(),
    role: z.enum(["trigger", "action", "logic"]),
    provider: z.string(),
    type: z.string(),
    purpose: z.string().optional(),
    requiredInputs: z.array(z.string()).optional(),
  })
  .passthrough();

const planShapeSchema = z
  .object({
    title: z.string().optional(),
    summary: z.string().optional(),
    steps: z.array(planStepShapeSchema).min(1),
    clarifyingQuestions: z.array(z.string()).optional(),
  })
  .passthrough();

export interface ExtractedPlanCandidate {
  /** Shape-valid WorkflowPlan candidate (NOT yet capability-validated). `notApplied` is forced true. */
  readonly plan: WorkflowPlan;
  /** The exact source substring (whole fenced block, or whole text) — for optional display stripping. */
  readonly sourceBlock: string;
}

/** Coerce a shape-validated parse into a normalized advisory `WorkflowPlan` (always `notApplied: true`). */
function toCandidatePlan(parsed: z.infer<typeof planShapeSchema>): WorkflowPlan {
  return {
    schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
    title: parsed.title ?? "",
    summary: parsed.summary ?? "",
    steps: parsed.steps.map((s, i) => ({
      ref: s.ref ?? `s${i}`,
      role: s.role,
      provider: s.provider,
      type: s.type,
      purpose: s.purpose ?? "",
      ...(s.requiredInputs ? { requiredInputs: s.requiredInputs } : {}),
    })),
    ...(parsed.clarifyingQuestions ? { clarifyingQuestions: parsed.clarifyingQuestions } : {}),
    notApplied: true,
  };
}

/** JSON.parse + shape-validate a single string. Returns a candidate plan or null (never throws). */
function tryParsePlan(jsonish: string): WorkflowPlan | null {
  const trimmed = jsonish.trim();
  if (!trimmed.startsWith("{")) return null; // only a JSON object can be a plan
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = planShapeSchema.safeParse(parsed);
  return result.success ? toCandidatePlan(result.data) : null;
}

/** Fenced code block: optional info string on the fence line, capture the body up to the closing fence. */
const FENCED_BLOCK_RE = /```[^\n]*\n([\s\S]*?)```/g;

/**
 * Extract the first shape-valid WorkflowPlan candidate embedded in `text`, or null.
 * Prefers fenced ```json blocks; falls back to the whole text when it is itself a bare JSON object.
 */
export function extractPlanFromText(text: string): ExtractedPlanCandidate | null {
  if (!text || typeof text !== "string") return null;

  // 1. Fenced blocks, in order. First shape-valid plan wins; non-plan JSON is skipped.
  FENCED_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCED_BLOCK_RE.exec(text)) !== null) {
    const candidate = tryParsePlan(match[1]!);
    if (candidate) return { plan: candidate, sourceBlock: match[0] };
  }

  // 2. The model returned ONLY a JSON object (no prose / no fence).
  const whole = tryParsePlan(text);
  if (whole) return { plan: whole, sourceBlock: text };

  return null;
}

/** The patch op discriminators — used to canonicalize the loose `{ "<opName>": {...} }` model encoding. */
const KNOWN_PATCH_OPS = new Set([
  "addNode", "updateNodeConfig", "removeNode", "addEdge", "removeEdge", "replaceEdge", "moveNode", "repairVariableReference", "replaceTrigger",
]);

/**
 * HERMES-AGENT-WORKFLOW-EDITOR — find the first fenced (or whole-text) JSON block that LOOKS like a
 * mutation payload (`operations` array OR `editVersion`) and return it so the caller can STRIP it from
 * the user-facing text — INDEPENDENT of strict validity, so raw machine JSON never leaks into the rail.
 *
 * When the operations canonicalize + validate, they are returned too (`operations` + `baseVersion`);
 * when the block is mutation-shaped but unusable, only `sourceBlock` is returned (a "malformed edit" the
 * route surfaces as a safe message). Returns null when no mutation-shaped block is present at all.
 *
 * Catalog / atomic / local-draft validation remains the route's job. This is STRUCTURE-only (Zod over
 * the op union), but tolerant of two common model encodings: `{ "<opName>": {...} }` instead of
 * `{ "op": "<opName>", ... }`, and flat `{ nodeId, providerType }` / `{ edgeId, from, to }` instead of
 * the nested `{ node: {...} }` / `{ edge: {...} }` shapes.
 */
export interface ExtractedMutationBlock {
  /** The exact source substring (fenced block or whole text) to STRIP from display — even if malformed. */
  readonly sourceBlock: string;
  /** Strict-valid, canonicalized operations. ABSENT when the block was mutation-shaped but unusable. */
  readonly operations?: PatchOperation[];
  /** The echoed editable-graph version, when present + plausible. */
  readonly baseVersion?: string;
}

export function extractMutationOperationsFromText(text: string): ExtractedMutationBlock | null {
  if (!text || typeof text !== "string") return null;
  FENCED_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCED_BLOCK_RE.exec(text)) !== null) {
    const obj = parseJsonObject(match[1]!);
    if (obj && looksLikeMutationObject(obj)) return { sourceBlock: match[0], ...validateMutationObject(obj) };
  }
  const whole = parseJsonObject(text);
  if (whole && looksLikeMutationObject(whole)) return { sourceBlock: text, ...validateMutationObject(whole) };
  return null;
}

function parseJsonObject(jsonish: string): Record<string, unknown> | null {
  const trimmed = jsonish.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A block is mutation-shaped (and so must be stripped) if it carries an operations array or a version. */
function looksLikeMutationObject(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj.operations) || typeof obj.editVersion === "string" || typeof obj.baseVersion === "string";
}

/** Canonicalize loose op encodings, Zod-validate, and pull the echoed version. Returns {} when unusable. */
function validateMutationObject(obj: Record<string, unknown>): { operations?: PatchOperation[]; baseVersion?: string } {
  const rawOps = Array.isArray(obj.operations) ? obj.operations : [];
  const coerced = rawOps.map(coercePatchOperation);
  const result = z.array(PatchOperationSchema).min(1).safeParse(coerced);
  const rawVersion = typeof obj.editVersion === "string" ? obj.editVersion : typeof obj.baseVersion === "string" ? obj.baseVersion : undefined;
  const baseVersion = rawVersion && /^[A-Za-z0-9._:-]{1,64}$/.test(rawVersion) ? rawVersion : undefined;
  return {
    ...(result.success ? { operations: result.data as PatchOperation[] } : {}),
    ...(baseVersion ? { baseVersion } : {}),
  };
}

/** "provider:type" → { provider, type } (single leading colon; type may itself be plain). */
function splitProviderType(pt: string): { provider?: string; type?: string } {
  const idx = pt.indexOf(":");
  if (idx <= 0 || idx >= pt.length - 1) return {};
  return { provider: pt.slice(0, idx), type: pt.slice(idx + 1) };
}

/** Build a WorkflowNode-shaped object from a flat `{ id|nodeId|ref, provider/type|providerType, ... }`. */
function buildNodeFromFlat(o: Record<string, unknown>, defaultKind: "trigger" | "action"): Record<string, unknown> {
  const id = o.id ?? o.nodeId ?? o.ref;
  let provider = o.provider;
  let type = o.type;
  if ((typeof provider !== "string" || typeof type !== "string") && typeof o.providerType === "string") {
    const split = splitProviderType(o.providerType);
    if (typeof provider !== "string") provider = split.provider;
    if (typeof type !== "string") type = split.type;
  }
  const kind = o.kind === "trigger" || o.kind === "action" ? o.kind : defaultKind;
  return {
    ...(id !== undefined ? { id } : {}),
    kind,
    ...(provider !== undefined ? { provider } : {}),
    ...(type !== undefined ? { type } : {}),
    config: o.config && typeof o.config === "object" ? o.config : {},
    position: o.position && typeof o.position === "object" ? o.position : { x: 0, y: 0 },
  };
}

/** Build a WorkflowEdge-shaped object from a flat `{ id|edgeId, from, to, label? }`. */
function buildEdgeFromFlat(o: Record<string, unknown>, fallbackId: string): Record<string, unknown> {
  const id = typeof o.id === "string" && o.id ? o.id : typeof o.edgeId === "string" && o.edgeId ? o.edgeId : fallbackId;
  return {
    id,
    ...(o.from !== undefined ? { from: o.from } : {}),
    ...(o.to !== undefined ? { to: o.to } : {}),
    ...(typeof o.label === "string" ? { label: o.label } : {}),
  };
}

/**
 * Canonicalize ONE possibly-loose operation into the strict `{ op, ... }` shape Zod expects. Unwraps the
 * `{ "<opName>": {...} }` form, and builds the nested `node` / `edge` objects from flat fields. Unknown
 * shapes pass through unchanged (Zod then rejects them).
 */
function coercePatchOperation(raw: unknown, index: number): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  let o = raw as Record<string, unknown>;
  // Unwrap `{ "<opName>": { ...fields } }` → `{ op: "<opName>", ...fields }`.
  if (typeof o.op !== "string") {
    const keys = Object.keys(o);
    if (keys.length === 1 && KNOWN_PATCH_OPS.has(keys[0]!)) {
      const op = keys[0]!;
      const body = o[op];
      o = { op, ...(body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}) };
    }
  }
  const op = o.op;
  if ((op === "addNode" || op === "replaceTrigger") && !(o.node && typeof o.node === "object")) {
    return { op, node: buildNodeFromFlat(o, op === "replaceTrigger" ? "trigger" : "action") };
  }
  if (op === "addEdge" && !(o.edge && typeof o.edge === "object")) {
    return { op, edge: buildEdgeFromFlat(o, `loose_edge_${index}`) };
  }
  if (op === "replaceEdge" && !(o.edge && typeof o.edge === "object")) {
    // `edgeId` here targets the EXISTING edge; the NEW edge gets its own id (never the target's).
    const edge = buildEdgeFromFlat({ from: o.from, to: o.to, label: o.label, id: o.newEdgeId }, `loose_edge_${index}`);
    return { op, ...(o.edgeId !== undefined ? { edgeId: o.edgeId } : {}), edge };
  }
  return o;
}

/**
 * Remove `sourceBlock` from `text` for cleaner display (the structured plan is surfaced separately).
 * Collapses the blank lines the removal leaves behind. If stripping would empty the text, returns
 * `null` so the caller can fall back (e.g. to a neutral lead-in) rather than show an empty body.
 */
export function stripSourceBlock(text: string, sourceBlock: string): string | null {
  const without = text.replace(sourceBlock, "").replace(/\n{3,}/g, "\n\n").trim();
  return without.length > 0 ? without : null;
}
