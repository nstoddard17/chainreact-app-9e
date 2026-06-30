import type { WorkflowNode, WorkflowNodeKind } from "@/contracts/workflow";
import type { ConfigDiffFieldMetaByType } from "@/core/workflows/configDiffFieldMeta";
import {
  resolveNodeLabel,
  type ConfigDiff,
  type ConfigFieldChange,
  type NodeConfigDiff,
} from "@/core/workflows/buildConfigDiff";
import {
  classifyFieldRisk,
  fieldRiskPhrase,
  type FieldRiskCategory,
} from "@/core/workflows/fieldRiskClassifier";

/**
 * Deterministic "Why this change?" rationale for the React Agent preview review rail
 * (REACT-AGENT-PREVIEW-WHY).
 *
 * The rail already shows the structural node diff (canvas) and the value-level config diff
 * (`buildConfigDiff`). This adds a short, USER-FACING explanation of the proposal: what the
 * user asked, what the agent changed, what it kept, and what still needs the user. It is the
 * "why" layer attached to the preview itself, not buried in the chat transcript.
 *
 * It is 100% DETERMINISTIC — derived only from the prompt the user typed, the already-computed
 * `ConfigDiff` (node statuses + missing-required fields), and the current/candidate node lists
 * (to detect a preserved trigger). NO model call, NO invented reasoning. The agent's one-line
 * `summary` is carried through for display ONLY and is never the source of a bullet claim, so a
 * stale or wrong summary can never produce an unsupported "why".
 *
 * No-leak contract: every bullet's text is built ONLY from the user's own prompt, node LABELS,
 * field LABELS, and the deterministic diff STATUS. It NEVER contains a config value, a
 * before/after value, a secret, a provider URL, or a raw payload — those live (already redacted)
 * in the config-diff section of the rail, never here. v1 deliberately emits NO "copied-value"
 * bullets: a copy cannot be proven from the redacted diff, so claiming one is out of scope.
 *
 * `core/` rule: imports only `contracts/` + client-safe `core/` helpers. Pure — no React, no
 * fetch, no services, no repositories, no I/O.
 */

export type AgentPreviewRationaleBulletKind =
  | "request_match"
  | "node_added"
  | "node_removed"
  | "node_changed"
  | "preserved"
  | "needs_user_input";

export interface AgentPreviewRationaleBullet {
  readonly kind: AgentPreviewRationaleBulletKind;
  /** Short, user-facing line. Labels + the user's prompt only — never a config value. */
  readonly text: string;
  /** The node this bullet is about, when applicable (for future click-to-focus). */
  readonly nodeId?: string;
  /** The field KEY this bullet is about, when applicable (never a value). */
  readonly fieldPath?: string;
}

/** The status of a high-risk field within the diff. */
export type FieldReasonStatus = "added" | "changed" | "removed";

/**
 * REACT-AGENT-PREVIEW-FIELD-REASONS — one field-level reason for a MAJOR / high-risk config change.
 * Only emitted for fields the deterministic classifier flags as high-risk (recipient / connection /
 * secret / trigger-config / action-effect); cosmetic fields never produce one. `text` is built from
 * the field LABEL + a fixed category phrase + the safe status, never a config value or secret.
 */
export interface AgentPreviewFieldReason {
  readonly nodeId: string;
  readonly nodeLabel: string;
  /** The field KEY (path) — never a value. */
  readonly fieldPath: string;
  readonly fieldLabel: string;
  readonly status: FieldReasonStatus;
  readonly category: FieldRiskCategory;
  /** Label-only sentence, e.g. "To changed: controls where this sends." */
  readonly text: string;
}

export interface AgentPreviewRationale {
  readonly title: string;
  /** The agent's one-line summary — display only; never the basis of a bullet claim. */
  readonly summary?: string;
  readonly bullets: readonly AgentPreviewRationaleBullet[];
  /** High-risk/major field-level reasons, grouped by node in the UI. Empty when none qualify. */
  readonly fieldReasons: readonly AgentPreviewFieldReason[];
}

interface GraphLike {
  readonly nodes: readonly WorkflowNode[];
}

export interface BuildPreviewRationaleInput {
  /** The user's prompt that drove this change. Echoed verbatim (truncated) as "request_match". */
  readonly prompt?: string;
  /** The agent's one-line summary — carried through for display only. */
  readonly summary?: string;
  /** The already-computed value-level diff (null when it failed to compute). */
  readonly configDiff: ConfigDiff | null;
  /** The live draft (current) node list — used only to detect a preserved trigger. */
  readonly current: GraphLike;
  /** The proposed end-state node list — used only to confirm the trigger survived unchanged. */
  readonly candidate: GraphLike;
  /** Registry field metadata, for labelling the preserved trigger consistently with the diff. */
  readonly fieldMetaByType?: ConfigDiffFieldMetaByType;
}

const TITLE = "Why this change?";
/** The prompt is the user's own text; cap it so the rationale stays short. */
const PROMPT_PREVIEW_LIMIT = 240;

function truncatePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > PROMPT_PREVIEW_LIMIT
    ? `${trimmed.slice(0, PROMPT_PREVIEW_LIMIT)}…`
    : trimmed;
}

function sameNodeType(a: WorkflowNode, b: WorkflowNode): boolean {
  return a.provider === b.provider && a.type === b.type;
}

const STATUS_WORD: Record<FieldReasonStatus, string> = {
  added: "added",
  changed: "changed",
  removed: "removed",
};

/** Lookup key into `fieldMetaByType` — mirrors `requirementLookupKey` (handles combined `native:router`). */
function metaKey(provider: string, type: string): string {
  return type.includes(":") ? type : `${provider}:${type}`;
}

/**
 * Deterministic high-risk field reasons. For each added/changed/removed field on a diffed node,
 * classify its risk from declarative metadata `sensitivity` (when known) + the field's secret flag +
 * conservative key-name heuristics + node kind. Low-risk/cosmetic fields are skipped (no noise). Each
 * reason text uses only the field LABEL + a fixed category phrase + the status — never a value.
 */
function buildFieldReasons(
  diffNodes: readonly NodeConfigDiff[],
  nodeKindById: ReadonlyMap<string, WorkflowNodeKind>,
  fieldMetaByType: ConfigDiffFieldMetaByType | undefined,
): AgentPreviewFieldReason[] {
  const reasons: AgentPreviewFieldReason[] = [];
  for (const node of diffNodes) {
    const nodeKind = nodeKindById.get(node.nodeId);
    const typeFields = fieldMetaByType?.[metaKey(node.provider, node.type)]?.fields;
    const consider = (change: ConfigFieldChange, status: FieldReasonStatus): void => {
      const sensitivity = typeFields?.[change.name]?.sensitivity;
      const category = classifyFieldRisk({
        name: change.name,
        secret: change.secret,
        ...(sensitivity ? { sensitivity } : {}),
        ...(nodeKind ? { nodeKind } : {}),
      });
      if (!category) return;
      reasons.push({
        nodeId: node.nodeId,
        nodeLabel: node.label,
        fieldPath: change.name,
        fieldLabel: change.label,
        status,
        category,
        text: `${change.label} ${STATUS_WORD[status]}: ${fieldRiskPhrase(category)}.`,
      });
    };
    for (const f of node.addedFields) consider(f, "added");
    for (const f of node.changedFields) consider(f, "changed");
    for (const f of node.removedFields) consider(f, "removed");
  }
  return reasons;
}

/**
 * Build the deterministic rationale. Returns a rationale with `bullets: []` when there is
 * nothing to explain; the rail renders the "why" section only when there is content.
 */
export function buildPreviewRationale(
  input: BuildPreviewRationaleInput,
): AgentPreviewRationale {
  const bullets: AgentPreviewRationaleBullet[] = [];
  const diffNodes = input.configDiff?.nodes ?? [];

  // 1. What the user asked for — echoed verbatim (their own text), never paraphrased/invented.
  const prompt = input.prompt?.trim();
  if (prompt) {
    bullets.push({ kind: "request_match", text: `You asked: "${truncatePrompt(prompt)}"` });
  }

  // 2. What the agent changed — one bullet per added/removed/changed node, labels only.
  for (const node of diffNodes) {
    if (node.status === "added") {
      bullets.push({ kind: "node_added", text: `Added ${node.label}.`, nodeId: node.nodeId });
    } else if (node.status === "removed") {
      bullets.push({ kind: "node_removed", text: `Removed ${node.label}.`, nodeId: node.nodeId });
    } else {
      bullets.push({ kind: "node_changed", text: `Updated ${node.label}.`, nodeId: node.nodeId });
    }
  }

  // 3. What was preserved — only the trigger(s), and only when something else actually changed
  //    (so we never emit "kept everything" noise on a no-op). Provable from the two graphs: a
  //    current trigger that survives in the candidate with the same provider:type and is absent
  //    from the diff (diff omits unchanged nodes) was left untouched.
  if (diffNodes.length > 0) {
    const changedNodeIds = new Set(diffNodes.map((n) => n.nodeId));
    const candidateById = new Map(input.candidate.nodes.map((n) => [n.id, n]));
    for (const node of input.current.nodes) {
      if (node.kind !== "trigger") continue;
      if (changedNodeIds.has(node.id)) continue;
      const candidate = candidateById.get(node.id);
      if (!candidate || !sameNodeType(node, candidate)) continue;
      const label = resolveNodeLabel(node, input.fieldMetaByType);
      bullets.push({ kind: "preserved", text: `Kept the ${label} trigger.`, nodeId: node.id });
    }
  }

  // 4. What could not be inferred / what the user needs to do next — still-missing required
  //    fields on added/changed nodes (field LABELS only; already secret-safe in the diff).
  for (const node of diffNodes) {
    for (const field of node.missingRequiredFields) {
      bullets.push({
        kind: "needs_user_input",
        text: `${node.label} still needs ${field.label}.`,
        nodeId: node.nodeId,
        fieldPath: field.name,
      });
    }
  }

  // 5. Field-level reasons for MAJOR / high-risk config changes (recipient / connection / secret /
  //    trigger-config / action-effect). Node kind comes from the candidate (added/changed) or current
  //    (removed) node lists — value-free; cosmetic fields are skipped by the classifier.
  const nodeKindById = new Map<string, WorkflowNodeKind>();
  for (const n of input.current.nodes) nodeKindById.set(n.id, n.kind);
  for (const n of input.candidate.nodes) nodeKindById.set(n.id, n.kind);
  const fieldReasons = buildFieldReasons(diffNodes, nodeKindById, input.fieldMetaByType);

  return {
    title: TITLE,
    ...(input.summary ? { summary: input.summary } : {}),
    bullets,
    fieldReasons,
  };
}
