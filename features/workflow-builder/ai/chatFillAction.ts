import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import { useConfigSlice } from "../state/configSlice";
import {
  isChatFillEligible,
  validateChatFillValue,
  type ChatFillIneligibleReason,
  type ChatFillValueReason,
} from "./chatFillEligibility";

/**
 * AI-CONFIG-ASSIST CS-2 — inert local pending-fill action.
 *
 * Plan: docs/slices/phase-4/ai/ai-config-assist-chat-fill-plan.md.
 *
 * The code path a later chat/UI (CS-3) will call to place a chat-typed value into
 * the **currently-targeted config DRAFT** — the exact pending layer a manual
 * keystroke writes (`configSlice.updateField`). It is NOT wired to any UI yet and
 * exposes nothing to users.
 *
 * Boundary (enforced structurally — this module imports only `configSlice`):
 *   - writes ONLY the per-node config rail draft (`configSlice.updateField`);
 *   - NEVER `graphSlice.updateNodeConfig` (canvas-pending), NEVER `graphSlice.save`
 *     (server persist), NEVER runs a workflow, NEVER mutates nodes/edges, NEVER Apply.
 *
 * Two functions, separated by purity:
 *   - `prepareChatFill` — PURE. Validates target + eligibility (CS-1) + value (CS-1)
 *     from explicit inputs; returns a before/after proposal or a stable reason.
 *     No slice read, no write.
 *   - `applyChatFillToDraft` — thin adapter. Re-validates via `prepareChatFill`, then
 *     calls `configSlice.updateField`. Its ONLY side effect is the draft write.
 *
 * No-leak: `nodeId` / `fieldKey` are internal targets (the proposal carries them so
 * the writer can act); user-facing copy is built from `nodeLabel` / `fieldLabel`.
 * Secrets / recipients / destructive-or-confirmation actions stay blocked via CS-1,
 * so a blocked field's value never reaches the proposal.
 */

export interface ChatFillProposal {
  /** Internal write target — NOT for rendered user copy. */
  readonly nodeId: string;
  /** Internal write target (FieldMeta.name) — NOT for rendered user copy. */
  readonly fieldKey: string;
  /** Friendly node label for UI summary, when known. */
  readonly nodeLabel?: string;
  /** Friendly field label for UI summary, when known. */
  readonly fieldLabel?: string;
  /** Prior draft value (coerced to a string; "" when empty/unset). */
  readonly previousValue: string;
  /** The EXACT validated value to place (never trimmed/normalized). */
  readonly newValue: string;
}

export type ChatFillResult =
  | { readonly ok: true; readonly proposal: ChatFillProposal }
  | { readonly ok: false; readonly reason: "STALE_NODE_TARGET" }
  | { readonly ok: false; readonly reason: "STALE_FIELD_TARGET" }
  | { readonly ok: false; readonly reason: "TARGET_NOT_HIGHLIGHTED" }
  | {
      readonly ok: false;
      readonly reason: "FIELD_NOT_ELIGIBLE";
      /** The underlying CS-1 eligibility reason. */
      readonly eligibilityReason: ChatFillIneligibleReason;
    }
  | {
      readonly ok: false;
      readonly reason: "VALUE_INVALID";
      /** The underlying CS-1 value reason. */
      readonly valueReason: ChatFillValueReason;
    };

export interface ChatFillInput {
  /** Target node id (focus target — not rendered). */
  readonly nodeId: string;
  /** Target field key / path (FieldMeta.name — not rendered). */
  readonly fieldKey: string;
  /** Resolved FieldMeta for `fieldKey`, or undefined if not on the node's metadata. */
  readonly field: FieldMeta | undefined;
  /** Action-level risk flags (omit for triggers — treated as non-destructive). */
  readonly action?: Pick<ActionMeta, "isDestructive" | "requiresConfirmation">;
  /** The user-provided value to place. */
  readonly value: unknown;
  /** Current draft value for the field, for the before/after proposal. */
  readonly currentValue?: unknown;
  /** Friendly labels for the later confirmation/summary UI. */
  readonly nodeLabel?: string;
  readonly fieldLabel?: string;
  /** Whether the node still exists in the current draft/graph (caller-resolved). */
  readonly nodeExists: boolean;
  /** The currently-highlighted field key (e.g. `configSlice.focusFieldKey`). */
  readonly highlightedFieldKey?: string | null;
  /**
   * When true (default), `fieldKey` MUST equal `highlightedFieldKey` — chat-fill
   * targets the field the user is actively looking at, never a stale/other field.
   */
  readonly requireHighlightMatch?: boolean;
}

function coercePreviousValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Pure validation + before/after proposal. No slice access, no write, never throws.
 * Returns the first applicable failure by safety order: stale node → stale field →
 * not-highlighted → CS-1 eligibility → CS-1 value.
 */
export function prepareChatFill(input: ChatFillInput): ChatFillResult {
  const {
    nodeId,
    fieldKey,
    field,
    action,
    value,
    currentValue,
    nodeLabel,
    fieldLabel,
    nodeExists,
    highlightedFieldKey,
    requireHighlightMatch = true,
  } = input;

  if (!nodeExists) return { ok: false, reason: "STALE_NODE_TARGET" };
  // Field key must still resolve to a real field on the node's metadata.
  if (!field || field.name !== fieldKey) {
    return { ok: false, reason: "STALE_FIELD_TARGET" };
  }
  if (requireHighlightMatch && (highlightedFieldKey ?? null) !== fieldKey) {
    return { ok: false, reason: "TARGET_NOT_HIGHLIGHTED" };
  }

  const eligibility = isChatFillEligible({ field, action });
  if (!eligibility.ok) {
    return { ok: false, reason: "FIELD_NOT_ELIGIBLE", eligibilityReason: eligibility.reason };
  }

  const valueResult = validateChatFillValue(value);
  if (!valueResult.ok) {
    return { ok: false, reason: "VALUE_INVALID", valueReason: valueResult.reason };
  }

  return {
    ok: true,
    proposal: {
      nodeId,
      fieldKey,
      ...(nodeLabel ? { nodeLabel } : {}),
      ...(fieldLabel ? { fieldLabel } : {}),
      previousValue: coercePreviousValue(currentValue),
      newValue: valueResult.value,
    },
  };
}

/**
 * Apply a chat-fill to the pending config DRAFT. Re-validates via `prepareChatFill`,
 * then performs the ONLY side effect: `configSlice.updateField` — identical to a
 * manual keystroke (sets the draft value + flips `isDirty`, never touching the
 * graph, save, or run). Returns the proposal (now applied) or the failure reason.
 *
 * Defense in depth: requires the node's rail draft to be open; a missing draft
 * means the target rail isn't available → `STALE_NODE_TARGET` (avoids a silent
 * `updateField` no-op).
 */
export function applyChatFillToDraft(input: ChatFillInput): ChatFillResult {
  const result = prepareChatFill(input);
  if (!result.ok) return result;

  const config = useConfigSlice.getState();
  if (!config.drafts[result.proposal.nodeId]) {
    return { ok: false, reason: "STALE_NODE_TARGET" };
  }
  config.updateField({
    nodeId: result.proposal.nodeId,
    name: result.proposal.fieldKey,
    value: result.proposal.newValue,
  });
  return result;
}
