import { isSecretLikeKey } from "@/core/security/secretKeys";
import { isRecipientOrDestinationKey } from "@/core/security/recipientKeys";
import type { PatchOperationKind } from "./types";

/**
 * Apply-readiness safety contract (Slice 4.AI-REPAIR-3A).
 *
 * The deterministic guardrail layer the FUTURE AI-REPAIR-3 "Apply" path must pass
 * before a previously-previewed, validated WorkflowPatch may ever be written. This
 * module is PURE policy: it classifies a patch's operations into apply-eligible vs
 * blocked categories and proves a patch is safe to apply RIGHT NOW. It performs NO
 * persistence, NO model call, NO graph mutation, NO run, NO UI — and there is NO
 * Apply button wired anywhere in this slice.
 *
 * It does NOT replace `validateWorkflowPatch` (structural/config/risk validation) —
 * it COMPOSES with it: the caller must re-run the deterministic validator against
 * the FRESH current definition immediately before apply and feed the verdict in
 * (`validation`). This contract adds the apply-only safety gates the validator does
 * not own:
 *   - operation-category allow-list (config/edge-reference repair only in v1),
 *   - secret / credential / provider-account / recipient write blocking,
 *   - destructive-deletion + whole-graph-replacement blocking,
 *   - trigger-change-on-active blocking (no lifecycle handling yet),
 *   - stale-preview + graph-changed-since-preview revision guards,
 *   - "must be typed operations, not raw model text" + "must carry validation".
 *
 * Fail-closed: anything unrecognized, ambiguous, or missing metadata BLOCKS. No-leak:
 * the verdict carries only operation KINDS, non-secret reason codes, and safe messages
 * — never a config VALUE, a secret/credential key name, a token, a revision's contents,
 * a role, or an account/provider identity.
 *
 * Doc: docs/slices/phase-4/ai/ai-repair-3-apply-contract-plan.md.
 */

/** Every recognized WorkflowPatch operation kind (the typed union in `./types`). */
export const KNOWN_OPERATION_KINDS: ReadonlySet<string> = new Set<PatchOperationKind>([
  "addNode",
  "updateNodeConfig",
  "removeNode",
  "addEdge",
  "removeEdge",
  "replaceEdge",
  "moveNode",
  "repairVariableReference",
  "replaceTrigger",
]);

/**
 * Operation kinds a future Apply MAY persist in v1 — narrow by design (config +
 * edge/variable-reference repair + layout). Field-level checks still apply to the
 * config-bearing ones. Everything else is fail-closed.
 */
export const APPLY_ELIGIBLE_OPERATION_KINDS: ReadonlySet<string> = new Set<PatchOperationKind>([
  "updateNodeConfig",
  "repairVariableReference",
  "addEdge",
  "removeEdge",
  "replaceEdge",
  "moveNode",
]);

/** Recognized operation kinds explicitly NOT apply-eligible in v1 (structural / lifecycle). */
export const APPLY_BLOCKED_OPERATION_KINDS: ReadonlySet<string> = new Set<PatchOperationKind>([
  "addNode",
  "removeNode",
  "replaceTrigger",
]);

/** Stable, no-leak block reason codes. */
export type ApplyBlockCode =
  | "NO_OPERATIONS" // empty operation list
  | "RAW_MODEL_TEXT" // operations isn't a typed-operation array (raw model output)
  | "UNKNOWN_OPERATION" // op kind not in the typed union
  | "OP_NOT_APPLYABLE" // recognized op outside the v1 apply allow-list (e.g. addNode)
  | "DESTRUCTIVE_DELETION" // removeNode — deleting an existing step
  | "WHOLE_GRAPH_REPLACEMENT" // removes every current node (regenerate, not repair)
  | "TRIGGER_CHANGE_ACTIVE" // replaceTrigger on an active (or unknown-state) workflow
  | "TRIGGER_CHANGE_REQUIRES_LIFECYCLE" // replaceTrigger on an inactive workflow — no lifecycle handling yet
  | "SECRET_WRITE" // config write to a secret/token/password/credential field
  | "CREDENTIAL_OR_ACCOUNT_MUTATION" // OAuth/integration credential or provider-account switch
  | "RECIPIENT_CHANGE" // changes where the workflow sends, without explicit confirmation
  | "NO_VALIDATION_METADATA" // no fresh deterministic validation result supplied
  | "VALIDATION_FAILED" // the fresh validation did not pass
  | "MISSING_BASE_REVISION" // patch carries no base revision
  | "STALE_PREVIEW" // patch base revision != the previewed snapshot revision
  | "GRAPH_CHANGED_SINCE_PREVIEW"; // workflow changed between preview and apply

export interface ApplyBlock {
  readonly code: ApplyBlockCode;
  /** Safe, user-explainable line. NEVER a config value, secret key, token, or identity. */
  readonly message: string;
  /** Index into the operation list, when op-scoped. */
  readonly opIndex?: number;
  /** Operation kind, when op-scoped. */
  readonly opKind?: string;
}

export interface ApplyReadiness {
  /** True iff EVERY gate passed and the patch may be applied (still honoring confirmation). */
  readonly applyable: boolean;
  /** Every blocking reason (empty iff `applyable`). */
  readonly blocks: readonly ApplyBlock[];
  /** Distinct block codes present, for telemetry / UI grouping. */
  readonly blockedCategories: readonly ApplyBlockCode[];
  /**
   * Carried from the deterministic validation — even an applyable patch must still
   * require explicit user confirmation when this is true.
   */
  readonly requiresConfirmation: boolean;
  /** Operation kinds present (safe — kinds only, never config). */
  readonly operationKinds: readonly string[];
}

export interface AssessApplyReadinessInput {
  /** Typed operations from the patch. `unknown` so raw/malformed model output is caught. */
  readonly operations: unknown;
  /**
   * The deterministic validator's FRESH verdict (re-run against the current definition
   * immediately before apply). `null`/`undefined` → blocked (`NO_VALIDATION_METADATA`).
   */
  readonly validation: { readonly ok: boolean; readonly requiresConfirmation?: boolean } | null | undefined;
  /** The patch's declared base revision (the snapshot it was built against). */
  readonly baseRevision: string | null | undefined;
  /**
   * The revision the user PREVIEWED against. Defaults to `baseRevision` when omitted.
   * `baseRevision !== previewRevision` → `STALE_PREVIEW`.
   */
  readonly previewRevision?: string | null | undefined;
  /**
   * The revision read FRESH immediately before apply. When provided and it differs
   * from the preview revision → `GRAPH_CHANGED_SINCE_PREVIEW`.
   */
  readonly currentRevision: string | null | undefined;
  /**
   * Live-trigger state. `false` = inactive (a trigger swap is at least lifecycle-gated).
   * `true` / `"unknown"` = fail closed → a trigger swap is blocked as active.
   */
  readonly workflowActive: boolean | "unknown";
  /** Current node ids — enables precise whole-graph-replacement detection. */
  readonly currentNodeIds?: readonly string[];
  /** FUTURE: a recipient/destination change explicitly confirmed by the user. Default false. */
  readonly recipientChangeConfirmed?: boolean;
}

/**
 * Connection/account IDENTITY keys (NON-secret, so `isSecretLikeKey` won't catch
 * them) whose mutation would re-point a step at a different credential / provider
 * account. Normalized-key matched. Deliberately narrow to the unambiguous identity
 * keys — generic business fields are not listed.
 */
const CONNECTION_IDENTITY_KEYS: ReadonlySet<string> = new Set([
  "accountid",
  "provideraccountid",
  "integrationid",
  "connectionid",
  "credentialid",
  "connectedbyuserid",
]);

function isConnectionIdentityKey(key: string): boolean {
  return CONNECTION_IDENTITY_KEYS.has(key.toLowerCase().replace(/[_\-\s]/g, ""));
}

/** Classify ONE config key into a blocking code, or null when the key is apply-safe. */
function classifyConfigKey(
  key: string,
  recipientChangeConfirmed: boolean,
): { code: ApplyBlockCode; message: string } | null {
  if (isSecretLikeKey(key)) {
    return { code: "SECRET_WRITE", message: "This change writes to a sensitive field, which can't be applied automatically." };
  }
  if (isConnectionIdentityKey(key)) {
    return {
      code: "CREDENTIAL_OR_ACCOUNT_MUTATION",
      message: "This change would switch the connected account or credential, which can't be applied automatically.",
    };
  }
  if (!recipientChangeConfirmed && isRecipientOrDestinationKey(key)) {
    return {
      code: "RECIPIENT_CHANGE",
      message: "This change alters where the workflow sends. It needs your explicit confirmation before it can be applied.",
    };
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Assess whether a previewed, validated patch is safe to apply RIGHT NOW. Pure +
 * deterministic; collects ALL blocking reasons (never short-circuits) so the caller
 * can surface a complete picture. `applyable` is true iff there are zero blocks.
 */
export function assessApplyReadiness(input: AssessApplyReadinessInput): ApplyReadiness {
  const blocks: ApplyBlock[] = [];
  const recipientConfirmed = input.recipientChangeConfirmed === true;

  // ── Metadata gates (revalidation + revision) ──
  if (input.validation === null || input.validation === undefined) {
    blocks.push({ code: "NO_VALIDATION_METADATA", message: "This change hasn't been validated, so it can't be applied." });
  } else if (input.validation.ok !== true) {
    blocks.push({ code: "VALIDATION_FAILED", message: "This change didn't pass validation, so it can't be applied." });
  }

  const baseRevision = input.baseRevision;
  if (baseRevision === null || baseRevision === undefined || baseRevision.length === 0) {
    blocks.push({ code: "MISSING_BASE_REVISION", message: "This change has no base version, so it can't be applied safely." });
  } else {
    const previewRevision =
      input.previewRevision === null || input.previewRevision === undefined
        ? baseRevision
        : input.previewRevision;
    if (baseRevision !== previewRevision) {
      blocks.push({ code: "STALE_PREVIEW", message: "This preview is out of date. Re-check the workflow and try again." });
    }
    if (
      input.currentRevision !== null &&
      input.currentRevision !== undefined &&
      input.currentRevision !== previewRevision
    ) {
      blocks.push({
        code: "GRAPH_CHANGED_SINCE_PREVIEW",
        message: "The workflow changed since this preview. Re-check the workflow and try again.",
      });
    }
  }

  // ── Operation gates ──
  if (!Array.isArray(input.operations)) {
    blocks.push({ code: "RAW_MODEL_TEXT", message: "This change isn't a set of typed operations, so it can't be applied." });
    return finalize(blocks, input.validation, []);
  }
  const operations = input.operations;
  if (operations.length === 0) {
    blocks.push({ code: "NO_OPERATIONS", message: "This change has no operations to apply." });
  }

  const operationKinds: string[] = [];
  const removedNodeIds = new Set<string>();

  operations.forEach((op, opIndex) => {
    if (!isPlainObject(op) || typeof op.op !== "string") {
      blocks.push({ code: "RAW_MODEL_TEXT", message: "This change contains an untyped operation, so it can't be applied.", opIndex });
      return;
    }
    const kind = op.op;
    operationKinds.push(kind);

    if (!KNOWN_OPERATION_KINDS.has(kind)) {
      blocks.push({ code: "UNKNOWN_OPERATION", message: "This change includes an operation we don't recognize, so it can't be applied.", opIndex, opKind: kind });
      return;
    }

    switch (kind) {
      case "removeNode": {
        const nodeId = typeof op.nodeId === "string" ? op.nodeId : undefined;
        if (nodeId) removedNodeIds.add(nodeId);
        blocks.push({ code: "DESTRUCTIVE_DELETION", message: "This change deletes a step, which can't be applied automatically.", opIndex, opKind: kind });
        return;
      }
      case "addNode": {
        blocks.push({ code: "OP_NOT_APPLYABLE", message: "Adding a step can't be applied automatically yet.", opIndex, opKind: kind });
        return;
      }
      case "replaceTrigger": {
        const active = input.workflowActive !== false; // true OR "unknown" → fail closed
        blocks.push(
          active
            ? { code: "TRIGGER_CHANGE_ACTIVE", message: "Changing the trigger on a live workflow can't be applied automatically.", opIndex, opKind: kind }
            : { code: "TRIGGER_CHANGE_REQUIRES_LIFECYCLE", message: "Changing the trigger isn't supported by automatic apply yet.", opIndex, opKind: kind },
        );
        return;
      }
      case "updateNodeConfig": {
        const config = isPlainObject(op.config) ? op.config : {};
        const seen = new Set<ApplyBlockCode>();
        for (const key of Object.keys(config)) {
          const hit = classifyConfigKey(key, recipientConfirmed);
          if (hit && !seen.has(hit.code)) {
            seen.add(hit.code);
            blocks.push({ ...hit, opIndex, opKind: kind });
          }
        }
        return;
      }
      case "repairVariableReference": {
        const fieldPath = typeof op.fieldPath === "string" ? op.fieldPath : "";
        const hit = fieldPath ? classifyConfigKey(fieldPath, recipientConfirmed) : null;
        if (hit) blocks.push({ ...hit, opIndex, opKind: kind });
        return;
      }
      // addEdge / removeEdge / replaceEdge / moveNode — apply-eligible, validation-gated.
      default:
        return;
    }
  });

  // Whole-graph replacement: a non-empty graph whose every node is removed is a
  // regenerate, not a repair — surfaced as its own category in addition to the
  // per-node destructive blocks already pushed above.
  const currentNodeIds = input.currentNodeIds;
  if (currentNodeIds && currentNodeIds.length > 0 && currentNodeIds.every((id) => removedNodeIds.has(id))) {
    blocks.push({ code: "WHOLE_GRAPH_REPLACEMENT", message: "This change would rebuild the whole workflow, which can't be applied automatically." });
  }

  return finalize(blocks, input.validation, operationKinds);
}

function finalize(
  blocks: readonly ApplyBlock[],
  validation: { readonly requiresConfirmation?: boolean } | null | undefined,
  operationKinds: readonly string[],
): ApplyReadiness {
  return {
    applyable: blocks.length === 0,
    blocks,
    blockedCategories: [...new Set(blocks.map((b) => b.code))],
    requiresConfirmation: validation?.requiresConfirmation === true,
    operationKinds,
  };
}
