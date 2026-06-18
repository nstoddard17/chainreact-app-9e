import { isSecretLikeKey } from "@/core/security/secretKeys";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { applyPatchToDefinition } from "./applyPatchToDefinition";
import { classifyOperationSafety, type ApplyBlock, type ApplyReadiness } from "./applySafety";
import type { ResolvedFieldSensitivity } from "./resolveFieldSensitivity";
import type { PatchOperation, PatchOperationKind } from "./types";

/**
 * Deterministic, IN-MEMORY WorkflowPatch executor (Slice 4.AI-REPAIR-3C).
 *
 * Given an already-safe typed patch + a PASSING `ApplyReadiness` verdict, produce the
 * next `WorkflowDefinition` and a no-leak execution summary. This is the deterministic
 * "what the apply WOULD produce" step — it is NOT persistence: it returns a new
 * in-memory definition and never writes.
 *
 * Pure + side-effect-free. Imports NO repository, NO Supabase client, NO save/update,
 * NO route, NO UI, NO run/activation path. It composes the existing pure applier
 * (`applyPatchToDefinition`, which deep-clones — the input definition is never mutated)
 * behind two fail-closed gates:
 *   1. Readiness gate — refuses unless `readiness.applyable === true` (missing /
 *      `applyable:false` → fail closed).
 *   2. Defense-in-depth — re-runs the shared `classifyOperationSafety` op gates against
 *      the ACTUAL operations (independent of the passed readiness), so a buggy caller
 *      that hands a wrongly-`applyable` verdict still cannot execute a blocked op
 *      (secret/credential/recipient write, addNode/removeNode/replaceTrigger,
 *      whole-graph replacement, unknown/raw op).
 *
 * Only the AI-REPAIR-3A apply-ELIGIBLE op kinds can ever execute: `updateNodeConfig`
 * (safe fields), `repairVariableReference`, `addEdge`, `removeEdge`, `replaceEdge`,
 * `moveNode`.
 *
 * No-leak: the `appliedOperations` summary + the before/after hashes carry only op
 * kinds, ids, and NON-secret field keys — never a config VALUE. (The returned
 * `updatedDefinition` does contain real config — it IS the next draft — so this stays
 * a service-only value; the 3B route does not expose it.)
 */

export type PatchExecutionFailureCode =
  | "NOT_APPLYABLE" // readiness missing or applyable:false (fail closed)
  | "OPERATION_NOT_EXECUTABLE" // defense-in-depth op block (caller's readiness was wrong)
  | "EXECUTION_FAILED"; // structural apply error (e.g. references a missing node/edge)

/** One value-free description of an executed operation. Never a config VALUE. */
export interface ExecutedOperationSummary {
  readonly op: PatchOperationKind;
  readonly nodeId?: string;
  readonly edgeId?: string;
  /** Non-secret config field KEY names touched (config/variable edits only). */
  readonly fields?: readonly string[];
}

export type PatchExecutionResult =
  | {
      readonly ok: true;
      /** The next draft definition (service-only — contains real config, never routed). */
      readonly updatedDefinition: WorkflowDefinition;
      readonly appliedOperations: readonly ExecutedOperationSummary[];
      /** Non-reversible structural+config digests for cheap no-op/change detection. */
      readonly beforeHash: string;
      readonly afterHash: string;
    }
  | {
      readonly ok: false;
      readonly code: PatchExecutionFailureCode;
      readonly message: string;
      /** Present for OPERATION_NOT_EXECUTABLE — the safe defense-in-depth blocks. */
      readonly blocks?: readonly ApplyBlock[];
    };

export interface ExecuteWorkflowPatchOptions {
  /** FUTURE: a recipient/destination change the user explicitly confirmed. */
  readonly recipientChangeConfirmed?: boolean;
  /**
   * AI-REPAIR-SAFETY-HARDENING CS-2 — declared field sensitivity (opIndex → fieldKey →
   * sensitivity), resolved by the caller from the registry. Threaded into the
   * defense-in-depth `classifyOperationSafety` so the executor's independent re-check is
   * also metadata-aware. Absent → heuristics-only (current behavior; never weaker).
   */
  readonly fieldSensitivity?: ResolvedFieldSensitivity;
}

/** Recursively sort object keys so the digest is order-independent for object configs. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Stable, non-reversible 32-bit FNV-1a digest of a definition (for change detection). */
export function hashDefinition(def: WorkflowDefinition): string {
  const json = JSON.stringify(canonical(def));
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Build the value-free per-operation summary. Only the apply-eligible kinds reach here. */
function summarizeOperation(op: PatchOperation): ExecutedOperationSummary {
  switch (op.op) {
    case "updateNodeConfig":
      return { op: op.op, nodeId: op.nodeId, fields: Object.keys(op.config).filter((k) => !isSecretLikeKey(k)) };
    case "repairVariableReference":
      return { op: op.op, nodeId: op.nodeId, ...(isSecretLikeKey(op.fieldPath) ? {} : { fields: [op.fieldPath] }) };
    case "moveNode":
      return { op: op.op, nodeId: op.nodeId };
    case "addEdge":
      return { op: op.op, edgeId: op.edge.id };
    case "removeEdge":
      return { op: op.op, edgeId: op.edgeId };
    case "replaceEdge":
      return { op: op.op, edgeId: op.edgeId };
    default:
      // addNode / removeNode / replaceTrigger are blocked before this point.
      return { op: op.op };
  }
}

/**
 * Execute a safe patch in memory. Fail-closed: requires a passing `ApplyReadiness`
 * AND re-asserts the operation safety gates. Never mutates `definition`.
 */
export function executeWorkflowPatch(
  definition: WorkflowDefinition,
  operations: readonly PatchOperation[],
  readiness: ApplyReadiness | null | undefined,
  options: ExecuteWorkflowPatchOptions = {},
): PatchExecutionResult {
  // 1. Readiness gate — fail closed when missing or not applyable.
  if (!readiness || readiness.applyable !== true) {
    return { ok: false, code: "NOT_APPLYABLE", message: "This change isn't cleared for apply." };
  }

  // 2. Defense-in-depth — re-classify the ACTUAL operations against the shared op
  //    gates, independent of the caller's readiness. A blocked op can never execute.
  const { blocks } = classifyOperationSafety(operations, {
    // Trigger ops are blocked regardless of state; pass "unknown" to fail closed here
    // (the executor isn't given the live state — the readiness gate already vetted it).
    workflowActive: "unknown",
    ...(options.recipientChangeConfirmed !== undefined ? { recipientChangeConfirmed: options.recipientChangeConfirmed } : {}),
    currentNodeIds: definition.nodes.map((n) => n.id),
    ...(options.fieldSensitivity !== undefined ? { fieldSensitivity: options.fieldSensitivity } : {}),
  });
  if (blocks.length > 0) {
    return { ok: false, code: "OPERATION_NOT_EXECUTABLE", message: "An operation in this change can't be executed.", blocks };
  }

  // 3. Delegate to the existing pure applier (deep-clones; never mutates input;
  //    atomic — a structural failure produces NO partial definition).
  const applied = applyPatchToDefinition(definition, operations);
  if (!applied.ok) {
    return { ok: false, code: "EXECUTION_FAILED", message: "This change couldn't be applied to the workflow." };
  }

  return {
    ok: true,
    updatedDefinition: applied.definition,
    appliedOperations: operations.map(summarizeOperation),
    beforeHash: hashDefinition(definition),
    afterHash: hashDefinition(applied.definition),
  };
}
