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

/**
 * HERMES-AGENT-WORKFLOW-EDITOR — extract structurally-valid `WorkflowPatch` operations from a fenced
 * ```json block of the form `{ "operations": [ ... ] }`. STRUCTURE-only (Zod over the op union) — the
 * catalog / atomic / local-draft validation is the route's job (`proposeWorkflowMutation`). Returns the
 * ops + the source block (for display stripping), or null when no valid patch block is present.
 */
export function extractMutationOperationsFromText(
  text: string,
): { operations: PatchOperation[]; baseVersion?: string; sourceBlock: string } | null {
  if (!text || typeof text !== "string") return null;
  FENCED_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCED_BLOCK_RE.exec(text)) !== null) {
    const ops = tryParseOperations(match[1]!);
    if (ops) return { ...ops, sourceBlock: match[0] };
  }
  const whole = tryParseOperations(text);
  return whole ? { ...whole, sourceBlock: text } : null;
}

/**
 * Parse a `{ "operations": [...], "editVersion"?: "..." }` block. HERMES-AGENT-WORKFLOW-EDITOR-LIVE: the
 * model echoes `editVersion` (the editable-graph version it edited against) so the server can reject a
 * STALE proposal. `editVersion`/`baseVersion` are both accepted; only a short opaque token is kept.
 */
function tryParseOperations(jsonish: string): { operations: PatchOperation[]; baseVersion?: string } | null {
  const trimmed = jsonish.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { operations?: unknown }).operations)) {
    return null;
  }
  const result = z.array(PatchOperationSchema).min(1).safeParse((parsed as { operations: unknown }).operations);
  if (!result.success) return null;
  const obj = parsed as { editVersion?: unknown; baseVersion?: unknown };
  const rawVersion = typeof obj.editVersion === "string" ? obj.editVersion : typeof obj.baseVersion === "string" ? obj.baseVersion : undefined;
  // Bound + shape-guard the echoed token (opaque hex-ish string); ignore anything implausible.
  const baseVersion = rawVersion && /^[A-Za-z0-9._:-]{1,64}$/.test(rawVersion) ? rawVersion : undefined;
  return { operations: result.data as PatchOperation[], ...(baseVersion ? { baseVersion } : {}) };
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
