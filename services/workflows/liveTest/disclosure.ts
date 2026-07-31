import { createHash } from "node:crypto";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import type { ActionMeta } from "@/contracts/actionMeta";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { providerLabel } from "@/core/workflows/templateCardMeta";

/**
 * Side-effect disclosure generator (WORKFLOW-LIVE-TEST-3 §4).
 *
 * Builds, from the SAVED workflow and the discovery registry, the structured list of real
 * external effects a live test may cause — what the future consent screen renders before the
 * user selects Start Live Test. Provider-agnostic by construction: every entry derives from
 * node identity + action/trigger METADATA (displayName, category, riskLevel, isDestructive),
 * never from a hard-coded template. The Google Review Test resolves to its six effects because
 * its nodes' metadata says so, not because this file knows that template exists.
 *
 * CLASSIFICATION
 *   - The trigger contributes a `reads` entry (a live test reads one real matching event).
 *   - Integration-backed actions classify by a deterministic verb table over the action `type`,
 *     falling back CLOSED: an unmatched verb (or a node with no registered metadata at all)
 *     becomes `changes` / `unknown-external` with `requiresAttention` — never silently benign.
 *   - `isDestructive` / `riskLevel: "high"` escalate: kind `deletes`, irreversible, attention.
 *   - Send-like operations are marked irreversible (delivery cannot be recalled).
 *   - Nodes whose metadata says `requiresIntegration: false` (native logic/transform) are listed
 *     separately as internal steps and NEVER described as external effects.
 *
 * NO-LEAK: entries carry provider ids/labels, metadata display names, and node display names —
 * never tokens, credential payloads, resource ids, or config values.
 *
 * BINDING: `disclosureDigest` is a SHA-256 over the canonical entry list. The disclosure is a
 * pure function of (saved definition, registry), and the workflow fingerprint already covers the
 * definition + connections — so fingerprint equality implies disclosure equality. The digest is
 * stored alongside for defense-in-depth: authorization re-derives it and refuses on mismatch,
 * proving the executed effects are the reviewed effects even if the registry itself shifted
 * between consent and execution (a deploy in the gap).
 */

export type DisclosureEffectKind =
  | "reads"
  | "creates"
  | "sends"
  | "updates"
  | "deletes"
  /** Fail-closed bucket: a real external call whose effect could not be classified. */
  | "changes";

export interface DisclosureEffect {
  readonly nodeId: string;
  readonly provider: string;
  readonly providerLabel: string;
  /** Metadata display name ("Send Email") — never a config value. */
  readonly operation: string;
  /** The node's reviewer-facing step name when the author set one. */
  readonly stepName: string | null;
  readonly kind: DisclosureEffectKind;
  readonly destructive: boolean;
  /** External changes that cannot be taken back once made (send, delete, high risk). */
  readonly mayBeIrreversible: boolean;
  /** True for destructive / unclassifiable operations — the UI must emphasize these. */
  readonly requiresAttention: boolean;
  /** Metadata risk one-liner where declared (already user-safe copy). */
  readonly riskDescription: string | null;
}

export interface LiveTestDisclosure {
  readonly effects: readonly DisclosureEffect[];
  /** Native logic/transform steps — shown as internal, never as external side effects. */
  readonly internalSteps: readonly { nodeId: string; operation: string }[];
  /** Fixed statements every consent screen must show. */
  readonly statements: readonly string[];
  readonly disclosureDigest: string;
}

/** Fixed consent statements (§4). Order is part of the digested document. */
export const LIVE_TEST_DISCLOSURE_STATEMENTS: readonly string[] = [
  "This live test calls your real connected apps and may create or change real data.",
  "Normal tasks and AI credits may be consumed, exactly like a regular run.",
  "The workflow stays inactive — this runs once and does not turn it on.",
  "External changes may not be reversible after execution starts.",
];

/** Deterministic verb table over the action type's first token. Fail-closed default: `changes`. */
const VERB_KINDS: ReadonlyArray<[RegExp, DisclosureEffectKind]> = [
  [/^(get|list|read|search|find|export|download)(_|$)/, "reads"],
  [/^(send|reply|post|publish)(_|$)/, "sends"],
  [/^(create|upload|append|add|insert|draft)(_|$)/, "creates"],
  [/^(update|move|rename|apply|mark|set|share|assign|label)(_|$)/, "updates"],
  [/^(delete|remove|archive|trash|cancel)(_|$)/, "deletes"],
];

function classifyActionKind(type: string): { kind: DisclosureEffectKind; matched: boolean } {
  for (const [re, kind] of VERB_KINDS) {
    if (re.test(type)) return { kind, matched: true };
  }
  return { kind: "changes", matched: false };
}

function effectForAction(node: WorkflowNode, meta: ActionMeta | undefined): DisclosureEffect {
  if (!meta) {
    // Unregistered external node — fail CLOSED: an unrecognized real external operation.
    return {
      nodeId: node.id,
      provider: node.provider,
      providerLabel: providerLabel(node.provider),
      operation: `Unrecognized operation (${node.type})`,
      stepName: node.displayName ?? null,
      kind: "changes",
      destructive: false,
      mayBeIrreversible: true,
      requiresAttention: true,
      riskDescription: null,
    };
  }
  const destructive = meta.isDestructive === true || meta.riskLevel === "high";
  const { kind: verbKind, matched } = classifyActionKind(node.type);
  const kind: DisclosureEffectKind = destructive && verbKind !== "deletes" ? "deletes" : verbKind;
  const irreversible = destructive || kind === "sends" || !matched;
  return {
    nodeId: node.id,
    provider: node.provider,
    providerLabel: providerLabel(node.provider),
    operation: meta.displayName,
    stepName: node.displayName ?? null,
    kind: destructive ? kind : verbKind,
    destructive,
    mayBeIrreversible: irreversible,
    requiresAttention: destructive || !matched,
    riskDescription: meta.riskDescription ?? null,
  };
}

export function generateLiveTestDisclosure(definition: WorkflowDefinition): LiveTestDisclosure {
  const effects: DisclosureEffect[] = [];
  const internalSteps: { nodeId: string; operation: string }[] = [];

  for (const node of definition.nodes) {
    if (!node.type) continue;
    const key = `${node.provider}:${node.type}`;

    if (node.kind === "trigger") {
      const meta = getTriggerMeta(key);
      if (meta?.requiresIntegration === false) {
        internalSteps.push({ nodeId: node.id, operation: meta.displayName });
        continue;
      }
      effects.push({
        nodeId: node.id,
        provider: node.provider,
        providerLabel: providerLabel(node.provider),
        operation: meta ? meta.displayName : `Unrecognized trigger (${node.type})`,
        stepName: node.displayName ?? null,
        kind: "reads",
        destructive: false,
        mayBeIrreversible: false,
        requiresAttention: meta === undefined,
        riskDescription: null,
      });
      continue;
    }

    const meta = getActionMeta(key);
    if (
      meta &&
      meta.requiresIntegration === false &&
      meta.riskLevel !== "high" &&
      meta.isDestructive !== true
    ) {
      // Native LOW-RISK logic/transform — an internal step, not an external side effect. The
      // risk guards matter: `native:http_request` is requiresIntegration:false yet is arbitrary
      // external egress (riskLevel "high" — the same reason testModeGate blocks it), so it must
      // land in the EFFECTS list, never be hidden as internal.
      internalSteps.push({ nodeId: node.id, operation: meta.displayName });
      continue;
    }
    effects.push(effectForAction(node, meta));
  }

  const digest = createHash("sha256")
    .update(JSON.stringify({ v: 1, effects, statements: LIVE_TEST_DISCLOSURE_STATEMENTS }), "utf8")
    .digest("hex");

  return {
    effects,
    internalSteps,
    statements: LIVE_TEST_DISCLOSURE_STATEMENTS,
    disclosureDigest: digest,
  };
}
