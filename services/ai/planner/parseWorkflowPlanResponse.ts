/**
 * Strict parser/validator for the model's workflow-plan response (Slice 4.AI-8A).
 *
 * The boundary NEVER trusts raw model text. This turns a raw string into a typed
 * {@link WorkflowPlanResponse} only after:
 *   1. rejecting empty output (EMPTY_RESPONSE);
 *   2. stripping a single markdown code fence, then requiring strict JSON — any
 *      surrounding prose fails (NOT_JSON);
 *   3. refusing any literal secret-keyed value anywhere in the payload
 *      (SECRET_IN_RESPONSE) — defense in depth even though the prompt forbids it;
 *   4. validating the wrapper shape (INVALID_SHAPE); and
 *   5. validating `proposedPatch` (when present) against the AI-3 schema
 *      (INVALID_PATCH). A null/absent patch is valid — it means "needs user
 *      input / nothing to apply".
 *
 * AI-8A does NOT run the patch through the AI-3 validator or AI-5 preview, and
 * does NOT apply it — that is AI-8B. This is schema-parse only.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §6/§8.
 */

import { z } from "zod";
import { isSecretKey, REDACTED } from "@/services/ai/tools/redact";
import { WorkflowPatchSchema } from "@/services/workflows/patch";
import type { WorkflowPatch } from "@/services/workflows/patch/types";
import type {
  ParseWorkflowPlanResult,
  PlanParseErrorCode,
  WorkflowPlanResponse,
} from "./types";

const PlanRequiredUserInputSchema = z.object({
  label: z.string().min(1),
  nodeId: z.string().optional(),
  field: z.string().optional(),
  kind: z.enum([
    "config_value",
    "select_integration",
    "choose_trigger",
    "variable_reference",
    "clarification",
  ]),
});

/**
 * Wrapper schema. Unknown top-level keys are STRIPPED (lenient — the dangerous
 * payload is `proposedPatch`, which is strictly validated by the AI-3 schema
 * separately). `intentSummary` + `confidence` are required; the rest default to
 * empty arrays. `proposedPatch` is unknown+nullable here and validated below.
 */
const WorkflowPlanResponseShapeSchema = z.object({
  intentSummary: z.string(),
  assumptions: z.array(z.string()).default([]),
  requiredUserInput: z.array(PlanRequiredUserInputSchema).default([]),
  proposedPatch: z.unknown().nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]),
  safetyNotes: z.array(z.string()).default([]),
  unsupportedRequests: z.array(z.string()).default([]),
});

function fail(code: PlanParseErrorCode, message: string): ParseWorkflowPlanResult {
  return { ok: false, code, message };
}

/** Strip a single wrapping ```json … ``` (or bare ``` … ```) fence, if present. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json|JSON)?\s*\r?\n?([\s\S]*?)\r?\n?```$/);
  return fence ? fence[1]!.trim() : trimmed;
}

function isVariableReference(value: string): boolean {
  return /\{\{[\s\S]*?\}\}/.test(value);
}

/**
 * True if any secret-keyed property holds a literal secret-shaped STRING value
 * — i.e. a non-empty string that is neither a `{{…}}` reference token nor the
 * REDACTED sentinel. Numbers/booleans under secret-ish keys (e.g. `maxTokens`)
 * are intentionally NOT flagged, so benign numeric config is preserved. The
 * scan never reads VALUES of non-secret keys, so free-text fields (intentSummary
 * etc.) are never flagged for their content.
 */
function containsLiteralSecret(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsLiteralSecret);
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      if (
        isSecretKey(key) &&
        typeof val === "string" &&
        val.trim() !== "" &&
        val !== REDACTED &&
        !isVariableReference(val)
      ) {
        return true;
      }
      if (containsLiteralSecret(val)) return true;
    }
  }
  return false;
}

export function parseWorkflowPlanResponse(raw: string): ParseWorkflowPlanResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return fail("EMPTY_RESPONSE", "The model returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return fail("NOT_JSON", "The model response was not valid JSON.");
  }

  // Defense in depth: refuse any literal credential before trusting the shape.
  if (containsLiteralSecret(parsed)) {
    return fail(
      "SECRET_IN_RESPONSE",
      "The model response contained a secret-shaped value and was refused.",
    );
  }

  const shape = WorkflowPlanResponseShapeSchema.safeParse(parsed);
  if (!shape.success) {
    return fail(
      "INVALID_SHAPE",
      `Response did not match the plan schema: ${shape.error.issues[0]?.message ?? "unknown error"}.`,
    );
  }

  let proposedPatch: WorkflowPatch | null = null;
  const rawPatch = shape.data.proposedPatch;
  if (rawPatch !== null && rawPatch !== undefined) {
    const patchParse = WorkflowPatchSchema.safeParse(rawPatch);
    if (!patchParse.success) {
      return fail(
        "INVALID_PATCH",
        `proposedPatch failed schema validation: ${patchParse.error.issues[0]?.message ?? "unknown error"}.`,
      );
    }
    proposedPatch = patchParse.data as WorkflowPatch;
  }

  const response: WorkflowPlanResponse = {
    intentSummary: shape.data.intentSummary,
    assumptions: shape.data.assumptions,
    requiredUserInput: shape.data.requiredUserInput,
    proposedPatch,
    confidence: shape.data.confidence,
    safetyNotes: shape.data.safetyNotes,
    unsupportedRequests: shape.data.unsupportedRequests,
  };

  return { ok: true, response };
}
