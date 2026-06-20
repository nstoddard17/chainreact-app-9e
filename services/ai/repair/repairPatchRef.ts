import { hashPayload } from "@/core/workflows/idempotency";
import type { PatchOperation } from "@/services/workflows/patch/types";

/**
 * Deterministic, opaque repair-patch reference (REACT-AGENT-CS-7B).
 *
 * A ONE-WAY content ref over the canonical `{ workflowId, baseRevision, operations }`
 * of an applyable repair patch. It is the storage-free correlation key between a repair
 * PROPOSAL/preview audit row (CS-6) and a future APPLY audit row (CS-7d): the same
 * approved operations against the same base revision always produce the same ref, with
 * NO durable approval table (see the CS-7 governance plan).
 *
 * Properties:
 *   - **Deterministic** — reuses the existing canonical-form SHA-256 (`hashPayload`):
 *     object keys sorted recursively (operation key order is irrelevant), array order
 *     preserved (operation order IS semantically meaningful → changes the ref).
 *   - **One-way / opaque** — the output is `repair_patch_sha256:<hex>`. The raw
 *     workflowId, node ids, config VALUES, and operation JSON are NOT recoverable from
 *     it; it is a digest, not an encoding. Safe to persist in an audit row.
 *   - **Pure** — does not mutate the input (the canonicalizer builds fresh objects).
 *   - **Fail-safe** — returns `null` when required fields are missing/empty/wrong-typed
 *     (no workflowId, no baseRevision, or no operations) rather than hashing a partial
 *     shape. A null ref means "no deterministic patch identity available" — the caller
 *     records `proposedPatchRef: null`.
 *
 * It carries NO accountId / userId / model text / prompt / response. Secrets cannot leak:
 * the inputs are an opaque workflow id, an opaque revision token, and typed operations
 * (which, on the apply-readiness path, are secret-free by construction), and the output
 * is a hash regardless.
 */

/** Opaque ref scheme prefix — lets a reader recognise the ref kind without parsing the hash. */
export const REPAIR_PATCH_REF_PREFIX = "repair_patch_sha256";

export interface RepairPatchRefInput {
  readonly workflowId: string;
  readonly baseRevision: string;
  readonly operations: readonly PatchOperation[];
}

/**
 * Compute the opaque ref, or `null` when the input lacks the deterministic patch
 * identity (missing/empty workflowId, baseRevision, or operations).
 */
export function repairPatchRef(
  input: RepairPatchRefInput | null | undefined,
): string | null {
  if (!input) return null;
  const { workflowId, baseRevision, operations } = input;
  if (typeof workflowId !== "string" || workflowId.trim() === "") return null;
  if (typeof baseRevision !== "string" || baseRevision.trim() === "") return null;
  if (!Array.isArray(operations) || operations.length === 0) return null;

  // Canonical-form SHA-256 (sorted keys, preserved array order) — reused, not re-implemented.
  const hash = hashPayload({ workflowId, baseRevision, operations });
  return `${REPAIR_PATCH_REF_PREFIX}:${hash}`;
}
